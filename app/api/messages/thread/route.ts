import { NextResponse } from "next/server";
import type { AccessUser } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { getMessagingThreadData } from "@/lib/direct-messages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    return jsonError("Unauthorized", 401);
  }

  const url = new URL(request.url);
  const threadKey = String(url.searchParams.get("threadKey") ?? "").trim();
  if (!threadKey) {
    return jsonError("Missing thread key.");
  }

  const data = await getMessagingThreadData(user as AccessUser, threadKey);
  return NextResponse.json(data);
}
