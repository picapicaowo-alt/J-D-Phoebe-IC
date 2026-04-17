import { getCurrentUser } from "@/lib/auth";
import { getRecentMessagesForStream } from "@/lib/direct-messages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encoder = new TextEncoder();

function encodeEvent(event: string, payload: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    return new Response("Unauthorized", { status: 401 });
  }

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let polling = false;
      let cursor = new Date(Date.now() - 10_000);
      let heartbeatId: ReturnType<typeof setInterval> | null = null;
      let pollId: ReturnType<typeof setInterval> | null = null;

      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeatId) clearInterval(heartbeatId);
        if (pollId) clearInterval(pollId);
        request.signal.removeEventListener("abort", close);
        try {
          controller.close();
        } catch {
          // Ignore double-close on abrupt client disconnects.
        }
      };

      const send = (event: string, payload: unknown) => {
        if (closed) return;
        controller.enqueue(encodeEvent(event, payload));
      };

      const poll = async () => {
        if (closed || polling) return;
        polling = true;
        try {
          const messages = await getRecentMessagesForStream(user.id, cursor);
          if (messages.length > 0) {
            cursor = new Date(messages[messages.length - 1]!.createdAt);
            for (const message of messages) {
              send("message", { message });
            }
          }
        } catch {
          send("error", { error: "stream_failed" });
        } finally {
          polling = false;
        }
      };

      request.signal.addEventListener("abort", close);
      send("ready", { ok: true });
      void poll();
      pollId = setInterval(() => void poll(), 1800);
      heartbeatId = setInterval(() => send("ping", { at: new Date().toISOString() }), 15_000);
    },
    cancel() {
      // The abort signal listener above handles timer cleanup.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
