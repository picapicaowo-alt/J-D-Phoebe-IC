"use server";

import { revalidatePath } from "next/cache";
import { WorkflowEdgeKind, WorkflowNodeStatus, WorkflowNodeType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { canEditProjectMap, type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { appendNodeCompletionLedgers, appendNodeOverdueOpenLedger } from "@/lib/scoring";

function must(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

async function loadProjectForMap(projectId: string, user: AccessUser) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { company: true, layers: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } } },
  });
  if (!project || !canEditProjectMap(user, project)) throw new Error("Forbidden");
  return project;
}

export async function createProjectMapNodeAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.map.update");
  const projectId = must(formData, "projectId");
  const project = await loadProjectForMap(projectId, user);
  const title = must(formData, "title");
  const nodeType = (String(formData.get("nodeType") ?? "TASK").trim() || "TASK") as WorkflowNodeType;
  const layerId = String(formData.get("layerId") ?? "").trim() || project.layers[0]?.id || null;
  const maxSort = await prisma.workflowNode.aggregate({
    where: { projectId, deletedAt: null, ...(layerId ? { layerId } : {}) },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSort._max.sortOrder ?? 0) + 1;

  const dueAtRaw = String(formData.get("dueAt") ?? "").trim();
  const dueAt =
    dueAtRaw === ""
      ? undefined
      : (() => {
          const d = new Date(dueAtRaw);
          return Number.isNaN(d.getTime()) ? undefined : d;
        })();

  const n = await prisma.workflowNode.create({
    data: {
      projectId,
      layerId,
      nodeType,
      title,
      description: String(formData.get("description") ?? "").trim() || null,
      status: WorkflowNodeStatus.NOT_STARTED,
      sortOrder,
      ...(dueAt !== undefined ? { dueAt } : {}),
    },
  });
  await writeAudit({ actorId: user.id, entityType: "WORKFLOW_NODE", entityId: n.id, action: "CREATE", newValue: title });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/workflow`);
}

export async function updateProjectMapNodeAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.map.update");
  const nodeId = must(formData, "nodeId");
  const node = await prisma.workflowNode.findFirst({
    where: { id: nodeId, deletedAt: null },
    include: {
      project: { include: { company: true } },
      assignees: { select: { userId: true } },
    },
  });
  if (!node) throw new Error("Not found");
  await loadProjectForMap(node.projectId, user);

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "").trim() as WorkflowNodeStatus | "";
  const nodeType = String(formData.get("nodeType") ?? "").trim() as WorkflowNodeType | "";
  const ownerId = String(formData.get("ownerId") ?? "").trim();
  const sortOrderRaw = String(formData.get("sortOrder") ?? "").trim();
  const dueAtRaw = String(formData.get("dueAt") ?? "").trim();
  const dueAtParsed =
    dueAtRaw === ""
      ? null
      : (() => {
          const d = new Date(dueAtRaw);
          return Number.isNaN(d.getTime()) ? null : d;
        })();

  const data: {
    title?: string;
    description?: string | null;
    status?: WorkflowNodeStatus;
    nodeType?: WorkflowNodeType;
    sortOrder?: number;
    dueAt?: Date | null;
  } = {};
  if (title) data.title = title;
  if (description !== undefined) data.description = description;
  if (status && (Object.values(WorkflowNodeStatus) as string[]).includes(status)) data.status = status as WorkflowNodeStatus;
  if (nodeType && (Object.values(WorkflowNodeType) as string[]).includes(nodeType)) data.nodeType = nodeType as WorkflowNodeType;
  if (sortOrderRaw !== "" && !Number.isNaN(Number(sortOrderRaw))) data.sortOrder = Number(sortOrderRaw);
  if (formData.has("dueAt")) {
    data.dueAt = dueAtParsed;
  }

  const prevStatus = node.status;
  const nextStatus = data.status ?? prevStatus;
  const effectiveDue = node.dueAt ?? node.project.deadline;
  const now = new Date();

  if (Object.keys(data).length) {
    await prisma.workflowNode.update({ where: { id: nodeId }, data });
  }

  if (nextStatus === "DONE" && prevStatus !== "DONE") {
    let userIds = node.assignees.map((a) => a.userId);
    if (!userIds.length) userIds = [node.project.ownerId];
    const onTime = !effectiveDue || now <= effectiveDue;
    await appendNodeCompletionLedgers(prisma, {
      nodeId,
      projectId: node.projectId,
      companyId: node.project.companyId,
      userIds,
      onTime,
    });
  } else if (nextStatus !== "DONE" && effectiveDue && now > effectiveDue) {
    let userIds = node.assignees.map((a) => a.userId);
    if (!userIds.length) userIds = [node.project.ownerId];
    await appendNodeOverdueOpenLedger(prisma, {
      nodeId,
      projectId: node.projectId,
      companyId: node.project.companyId,
      userIds,
    });
  }

  if (ownerId) {
    const pmRole = await prisma.roleDefinition.findUnique({ where: { key: "PROJECT_CONTRIBUTOR" } });
    if (!pmRole) throw new Error("Missing role");
    await prisma.workflowNodeAssignee.upsert({
      where: { workflowNodeId_userId: { workflowNodeId: nodeId, userId: ownerId } },
      create: { workflowNodeId: nodeId, userId: ownerId, responsibility: "Owner" },
      update: { responsibility: "Owner" },
    });
  }

  revalidatePath(`/projects/${node.projectId}`);
  revalidatePath(`/projects/${node.projectId}/workflow`);
}

export async function softDeleteProjectMapNodeAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.map.update");
  const nodeId = must(formData, "nodeId");
  const node = await prisma.workflowNode.findFirst({ where: { id: nodeId, deletedAt: null } });
  if (!node) throw new Error("Not found");
  await loadProjectForMap(node.projectId, user);
  await prisma.workflowNode.update({ where: { id: nodeId }, data: { deletedAt: new Date() } });
  revalidatePath(`/projects/${node.projectId}`);
  revalidatePath(`/projects/${node.projectId}/workflow`);
}

export async function createProjectMapEdgeAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.map.update");
  const projectId = must(formData, "projectId");
  await loadProjectForMap(projectId, user);
  const fromNodeId = must(formData, "fromNodeId");
  const toNodeId = must(formData, "toNodeId");
  if (fromNodeId === toNodeId) throw new Error("Invalid");
  const kind = (String(formData.get("kind") ?? "DEPENDENCY").trim() || "DEPENDENCY") as WorkflowEdgeKind;
  const existing = await prisma.workflowEdge.findFirst({ where: { projectId, fromNodeId, toNodeId, kind } });
  if (existing?.deletedAt) {
    await prisma.workflowEdge.update({ where: { id: existing.id }, data: { deletedAt: null } });
  } else if (!existing) {
    await prisma.workflowEdge.create({ data: { projectId, fromNodeId, toNodeId, kind } });
  }
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/workflow`);
}

export async function removeProjectMapEdgeAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.map.update");
  const edgeId = must(formData, "edgeId");
  const edge = await prisma.workflowEdge.findFirst({ where: { id: edgeId, deletedAt: null } });
  if (!edge) throw new Error("Not found");
  await loadProjectForMap(edge.projectId, user);
  await prisma.workflowEdge.update({ where: { id: edgeId }, data: { deletedAt: new Date() } });
  revalidatePath(`/projects/${edge.projectId}`);
  revalidatePath(`/projects/${edge.projectId}/workflow`);
}
