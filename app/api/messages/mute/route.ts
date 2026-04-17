import { NextResponse } from "next/server";
import type { AccessUser } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { setThreadMuted } from "@/lib/direct-messages";

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

  const payload = (await request.json().catch(() => null)) as { threadKey?: string; muted?: boolean } | null;
  const threadKey = String(payload?.threadKey ?? "").trim();
  if (!threadKey) {
    return jsonError("Missing threadKey");
  }

  try {
    const result = await setThreadMuted(user as AccessUser, threadKey, Boolean(payload?.muted));
    return NextResponse.json(result);
  } catch (error) {
    const text = error instanceof Error ? error.message : "Could not update notifications.";
    const status = text.toLowerCase().includes("not available") ? 403 : 400;
    return jsonError(text, status);
  }
}
