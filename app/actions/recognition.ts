"use server";

import { revalidatePath } from "next/cache";
import { RecognitionMode, RecognitionTagCategory } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { canViewProject, type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

function must(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

export async function createRecognitionAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "recognition.create");

  const toUserId = must(formData, "toUserId");
  const projectId = must(formData, "projectId");
  const mode = must(formData, "mode") as RecognitionMode;
  const tagCategory = must(formData, "tagCategory") as RecognitionTagCategory;
  const tagLabel = must(formData, "tagLabel");
  const message = String(formData.get("message") ?? "").trim() || null;

  const [project, user] = await Promise.all([
    prisma.project.findFirst({ where: { id: projectId, deletedAt: null }, include: { company: true } }),
    prisma.user.findFirst({ where: { id: toUserId, deletedAt: null } }),
  ]);
  if (!project || !user) throw new Error("Project or member not found");
  if (!canViewProject(actor, project)) throw new Error("Forbidden");

  const rec = await prisma.recognitionEvent.create({
    data: {
      fromUserId: actor.id,
      toUserId,
      projectId,
      mode,
      tagCategory,
      tagLabel,
      message,
    },
  });

  await writeAudit({
    actorId: actor.id,
    entityType: "RECOGNITION",
    entityId: rec.id,
    action: "CREATE",
    meta: JSON.stringify({ toUserId, projectId, mode, tagCategory }),
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/staff/${toUserId}`);
  revalidatePath("/home");
}
