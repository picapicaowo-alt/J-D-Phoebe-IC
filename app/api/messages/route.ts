import { NextResponse } from "next/server";
import type { AccessUser } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { createDirectMessage, getDirectMessagesPageData } from "@/lib/direct-messages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isUpload(value: FormDataEntryValue): value is File {
  return typeof value !== "string" && "arrayBuffer" in value;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    return jsonError("Unauthorized", 401);
  }

  const url = new URL(request.url);
  const peerId = String(url.searchParams.get("peerId") ?? "").trim() || null;
  const data = await getDirectMessagesPageData(user as AccessUser, peerId);
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    return jsonError("Unauthorized", 401);
  }

  const formData = await request.formData();
  const peerId = String(formData.get("peerId") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  const files = formData.getAll("files").filter(isUpload);

  try {
    const message = await createDirectMessage(user as AccessUser, peerId, body, files);
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    const text = error instanceof Error ? error.message : "Could not send the message.";
    const status = text.toLowerCase().includes("not available") ? 403 : 400;
    return jsonError(text, status);
  }
}
