import { NextResponse } from "next/server";
import type { AccessUser } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { markConversationRead } from "@/lib/direct-messages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    return jsonError("Unauthorized", 401);
  }

  const payload = (await request.json().catch(() => null)) as { peerId?: string } | null;
  const peerId = String(payload?.peerId ?? "").trim();
  if (!peerId) {
    return jsonError("Missing peerId");
  }

  try {
    const count = await markConversationRead(user as AccessUser, peerId);
    return NextResponse.json({ ok: true, count });
  } catch (error) {
    const text = error instanceof Error ? error.message : "Could not update read state.";
    const status = text.toLowerCase().includes("not available") ? 403 : 400;
    return jsonError(text, status);
  }
}
