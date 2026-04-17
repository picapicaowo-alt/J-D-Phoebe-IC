import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { findMessageAttachmentForUser } from "@/lib/direct-messages";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const attachment = await findMessageAttachmentForUser(user.id, id);
  if (!attachment) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (attachment.blobUrl) {
    return NextResponse.redirect(attachment.blobUrl);
  }

  if (!attachment.storageKey) {
    return new NextResponse("File missing", { status: 404 });
  }

  const storageParts = path.normalize(attachment.storageKey).split(/[\\/]+/).filter(Boolean);
  if (storageParts[0] !== "uploads" || storageParts.some((part) => part === "..")) {
    return new NextResponse("Unsupported file path", { status: 404 });
  }

  const abs = path.join(process.cwd(), "uploads", ...storageParts.slice(1));
  try {
    const buf = await readFile(abs);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": attachment.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      },
    });
  } catch {
    return new NextResponse("File missing", { status: 404 });
  }
}
