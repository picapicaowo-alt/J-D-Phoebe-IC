"use server";

import { revalidatePath } from "next/cache";
import { WorkflowEdgeKind, WorkflowNodeStatus, WorkflowNodeType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { canEditProjectMap, type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

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

  const n = await prisma.workflowNode.create({
    data: {
      projectId,
      layerId,
      nodeType,
      title,
      description: String(formData.get("description") ?? "").trim() || null,
      status: WorkflowNodeStatus.NOT_STARTED,
      sortOrder,
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
    include: { project: { include: { company: true } } },
  });
  if (!node) throw new Error("Not found");
  await loadProjectForMap(node.projectId, user);

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "").trim() as WorkflowNodeStatus | "";
  const nodeType = String(formData.get("nodeType") ?? "").trim() as WorkflowNodeType | "";
  const ownerId = String(formData.get("ownerId") ?? "").trim();
  const sortOrderRaw = String(formData.get("sortOrder") ?? "").trim();

  const data: {
    title?: string;
    description?: string | null;
    status?: WorkflowNodeStatus;
    nodeType?: WorkflowNodeType;
    sortOrder?: number;
  } = {};
  if (title) data.title = title;
  if (description !== undefined) data.description = description;
  if (status && (Object.values(WorkflowNodeStatus) as string[]).includes(status)) data.status = status as WorkflowNodeStatus;
  if (nodeType && (Object.values(WorkflowNodeType) as string[]).includes(nodeType)) data.nodeType = nodeType as WorkflowNodeType;
  if (sortOrderRaw !== "" && !Number.isNaN(Number(sortOrderRaw))) data.sortOrder = Number(sortOrderRaw);

  if (Object.keys(data).length) {
    await prisma.workflowNode.update({ where: { id: nodeId }, data });
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
