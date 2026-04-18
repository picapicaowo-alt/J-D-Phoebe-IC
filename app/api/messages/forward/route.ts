import { NextResponse } from "next/server";
import type { AccessUser } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { forwardThreadMessages } from "@/lib/direct-messages";

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

  const payload = (await request.json().catch(() => null)) as
    | { sourceThreadKey?: string; targetThreadKey?: string; messageIds?: unknown }
    | null;
  const sourceThreadKey = String(payload?.sourceThreadKey ?? "").trim();
  const targetThreadKey = String(payload?.targetThreadKey ?? "").trim();

  try {
    const result = await forwardThreadMessages(
      user as AccessUser,
      sourceThreadKey,
      targetThreadKey,
      payload?.messageIds,
    );
    return NextResponse.json(result);
  } catch (error) {
    const text = error instanceof Error ? error.message : "Could not forward the selected messages.";
    const lower = text.toLowerCase();
    const status = lower.includes("permission") || lower.includes("not available") ? 403 : 400;
    return jsonError(text, status);
  }
}
