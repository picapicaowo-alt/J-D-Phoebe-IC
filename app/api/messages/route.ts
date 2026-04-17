import { NextResponse } from "next/server";
import type { AccessUser } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { createThreadMessage, getMessagingPageData } from "@/lib/direct-messages";

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
  const threadKey = String(url.searchParams.get("threadKey") ?? "").trim() || null;
  const data = await getMessagingPageData(user as AccessUser, threadKey, { includeGroupOptions: false });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    return jsonError("Unauthorized", 401);
  }

  const contentType = request.headers.get("content-type") ?? "";
  let threadKey = "";
  let body = "";
  let files: File[] = [];

  if (contentType.includes("application/json")) {
    const payload = (await request.json().catch(() => null)) as { threadKey?: string; body?: string } | null;
    threadKey = String(payload?.threadKey ?? "").trim();
    body = String(payload?.body ?? "");
  } else {
    const formData = await request.formData();
    threadKey = String(formData.get("threadKey") ?? "").trim();
    body = String(formData.get("body") ?? "");
    files = formData.getAll("files").filter(isUpload);
  }

  try {
    const message = await createThreadMessage(user as AccessUser, threadKey, body, files);
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    const text = error instanceof Error ? error.message : "Could not send the message.";
    const status = text.toLowerCase().includes("not available") ? 403 : 400;
    return jsonError(text, status);
  }
}
