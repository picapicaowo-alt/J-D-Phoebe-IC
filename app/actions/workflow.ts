"use server";

import { revalidatePath } from "next/cache";
import { WorkflowEdgeKind } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { canEditWorkflow, type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function saveWorkflowPositionsAction(projectId: string, positions: { id: string; x: number; y: number }[]) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.workflow.update");
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { company: true },
  });
  if (!project || !canEditWorkflow(user, project)) throw new Error("Forbidden");

  await prisma.$transaction(
    positions.map((p) =>
      prisma.workflowNode.updateMany({
        where: { id: p.id, projectId, deletedAt: null },
        data: { posX: p.x, posY: p.y },
      }),
    ),
  );
  revalidatePath(`/projects/${projectId}/workflow`);
}

export async function createWorkflowEdgeAction(
  projectId: string,
  fromNodeId: string,
  toNodeId: string,
  kind: WorkflowEdgeKind = "DEPENDENCY",
): Promise<string> {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.workflow.update");
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { company: true },
  });
  if (!project || !canEditWorkflow(user, project)) throw new Error("Forbidden");
  if (fromNodeId === toNodeId) throw new Error("Invalid edge");

  const [a, b] = await Promise.all([
    prisma.workflowNode.findFirst({ where: { id: fromNodeId, projectId, deletedAt: null } }),
    prisma.workflowNode.findFirst({ where: { id: toNodeId, projectId, deletedAt: null } }),
  ]);
  if (!a || !b) throw new Error("Node not found");

  const existing = await prisma.workflowEdge.findFirst({
    where: { projectId, fromNodeId, toNodeId, kind },
  });
  let edgeId: string;
  if (existing) {
    if (existing.deletedAt) {
      await prisma.workflowEdge.update({
        where: { id: existing.id },
        data: { deletedAt: null },
      });
    }
    edgeId = existing.id;
  } else {
    const created = await prisma.workflowEdge.create({
      data: { projectId, fromNodeId, toNodeId, kind },
    });
    edgeId = created.id;
  }
  revalidatePath(`/projects/${projectId}/workflow`);
  return edgeId;
}

export async function softDeleteWorkflowEdgeAction(projectId: string, edgeId: string) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.workflow.update");
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { company: true },
  });
  if (!project || !canEditWorkflow(user, project)) throw new Error("Forbidden");

  await prisma.workflowEdge.updateMany({
    where: { id: edgeId, projectId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/projects/${projectId}/workflow`);
}
