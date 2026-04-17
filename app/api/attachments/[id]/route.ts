import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import type { AccessUser } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewAttachment } from "@/lib/attachment-access";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const accessUser = user as AccessUser;
  const { id } = await params;

  const att = await prisma.attachment.findFirst({
    where: { id, deletedAt: null },
    include: {
      node: { include: { project: { include: { company: true } } } },
      project: { include: { company: true } },
      knowledgeAsset: { include: { author: true } },
      contributor: true,
      onboardingPackageFor: { include: { company: true } },
      onboardingVideoFor: { include: { company: true } },
    },
  });
  if (!att) return new NextResponse("Not found", { status: 404 });

  const allowed = await canViewAttachment(accessUser, att);

  if (!allowed) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (att.resourceKind === "EXTERNAL_URL" && att.externalUrl) {
    return NextResponse.redirect(att.externalUrl);
  }

  if (att.blobUrl) {
    return NextResponse.redirect(att.blobUrl);
  }

  if (!att.storageKey) {
    return new NextResponse("No file for this resource", { status: 404 });
  }

  const storageParts = path.normalize(att.storageKey).split(/[\\/]+/).filter(Boolean);
  if (storageParts[0] !== "uploads" || storageParts.some((part) => part === "..")) {
    return new NextResponse("Unsupported file path", { status: 404 });
  }

  const abs = path.join(process.cwd(), "uploads", ...storageParts.slice(1));
  try {
    const buf = await readFile(abs);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": att.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
      },
    });
  } catch {
    return new NextResponse("File missing", { status: 404 });
  }
}
