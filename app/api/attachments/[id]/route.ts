import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import type { AccessUser } from "@/lib/access";
import { canViewProject } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

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
    },
  });
  if (!att) return new NextResponse("Not found", { status: 404 });

  let allowed = false;
  if (att.node?.project) {
    allowed = canViewProject(accessUser, att.node.project);
  } else if (att.project) {
    allowed = canViewProject(accessUser, att.project);
  } else if (att.knowledgeAsset) {
    allowed =
      accessUser.id === att.knowledgeAsset.authorId ||
      accessUser.isSuperAdmin ||
      (await userHasPermission(accessUser, "knowledge.read"));
  } else if (att.contributorUserId) {
    allowed = accessUser.id === att.contributorUserId || accessUser.isSuperAdmin;
  }

  if (!allowed) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (att.blobUrl) {
    return NextResponse.redirect(att.blobUrl);
  }

  const abs = path.join(process.cwd(), att.storageKey);
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
