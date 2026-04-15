"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { WorkflowNodeStatus, WorkflowNodeType } from "@prisma/client";
import { getAppSession, requireUser } from "@/lib/auth";
import { canEditWorkflow, canManageProject, canViewProject, type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { syncProjectTaskRollups } from "@/lib/project-task-progress";

/** Run rollup + second revalidate after the response is sent so mutations return fast (avoids Vercel / PgBouncer timeouts). */
function scheduleTaskRollupRevalidate(projectId: string) {
  after(async () => {
    try {
      await syncProjectTaskRollups(projectId);
      revalidatePath(`/projects/${projectId}`);
      revalidatePath("/projects");
    } catch (err) {
      console.error("[syncProjectTaskRollups]", projectId, err);
    }
  });
}

function requireString(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

function parseOptionalDueAt(formData: FormData, key = "dueAt"): Date | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function defaultLayerId(projectId: string) {
  let layer = await prisma.workflowLayer.findFirst({
    where: { projectId, deletedAt: null },
    orderBy: { sortOrder: "asc" },
  });
  if (!layer) {
    layer = await prisma.workflowLayer.create({
      data: { projectId, name: "Default layer", sortOrder: 0 },
    });
  }
  return layer.id;
}

/** Anyone who can view the project and is a member (or PM/admin) may edit tasks if they hold `project.workflow.update`. */
async function requireProjectForTasks(user: AccessUser, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { company: true },
  });
  if (!project) throw new Error("Not found");
  if (!canViewProject(user, project)) throw new Error("Forbidden");
  const isMember = user.projectMemberships.some((m) => m.projectId === projectId);
  if (!canManageProject(user, project) && !canEditWorkflow(user, project) && !isMember) {
    throw new Error("Forbidden");
  }
  return project;
}

export async function addProjectTaskAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.workflow.update");
  const projectId = requireString(formData, "projectId");
  await requireProjectForTasks(user, projectId);
  const title = requireString(formData, "title");
  const assigneeId = String(formData.get("assigneeId") ?? "").trim() || null;
  const dueAt = parseOptionalDueAt(formData, "dueAt");

  const layerId = await defaultLayerId(projectId);
  const maxSort = await prisma.workflowNode.aggregate({
    where: { projectId, parentNodeId: null, deletedAt: null },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

  const node = await prisma.workflowNode.create({
    data: {
      projectId,
      layerId,
      parentNodeId: null,
      nodeType: WorkflowNodeType.TASK,
      title,
      status: WorkflowNodeStatus.NOT_STARTED,
      progressPercent: 0,
      sortOrder,
      dueAt,
    },
  });

  if (assigneeId) {
    await prisma.workflowNodeAssignee.upsert({
      where: { workflowNodeId_userId: { workflowNodeId: node.id, userId: assigneeId } },
      create: { workflowNodeId: node.id, userId: assigneeId, responsibility: null },
      update: {},
    });
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  scheduleTaskRollupRevalidate(projectId);
}

export async function addProjectSubtaskAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.workflow.update");
  const projectId = requireString(formData, "projectId");
  await requireProjectForTasks(user, projectId);
  const parentNodeId = requireString(formData, "parentNodeId");
  const title = requireString(formData, "title");
  const assigneeId = String(formData.get("assigneeId") ?? "").trim() || null;
  const dueAt = parseOptionalDueAt(formData, "dueAt");

  const parent = await prisma.workflowNode.findFirst({
    where: { id: parentNodeId, projectId, deletedAt: null },
  });
  if (!parent) throw new Error("Parent not found");
  if (parent.parentNodeId) throw new Error("Subtasks cannot be nested deeper");

  const maxSort = await prisma.workflowNode.aggregate({
    where: { projectId, parentNodeId, deletedAt: null },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

  const sub = await prisma.workflowNode.create({
    data: {
      projectId,
      layerId: parent.layerId,
      parentNodeId,
      nodeType: WorkflowNodeType.TASK,
      title,
      status: WorkflowNodeStatus.NOT_STARTED,
      progressPercent: 0,
      sortOrder,
      dueAt,
    },
  });

  if (assigneeId) {
    await prisma.workflowNodeAssignee.upsert({
      where: { workflowNodeId_userId: { workflowNodeId: sub.id, userId: assigneeId } },
      create: { workflowNodeId: sub.id, userId: assigneeId, responsibility: null },
      update: {},
    });
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  scheduleTaskRollupRevalidate(projectId);
}

export async function updateWorkflowNodeMetaAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.workflow.update");
  const projectId = requireString(formData, "projectId");
  await requireProjectForTasks(user, projectId);
  const nodeId = requireString(formData, "nodeId");

  const node = await prisma.workflowNode.findFirst({
    where: { id: nodeId, projectId, deletedAt: null },
  });
  if (!node) throw new Error("Not found");

  const description = String(formData.get("description") ?? "").trim() || null;
  const dueAt = parseOptionalDueAt(formData, "dueAt");
  const assigneeId = String(formData.get("assigneeId") ?? "").trim();

  await prisma.workflowNode.update({
    where: { id: nodeId },
    data: { description, dueAt },
  });

  await prisma.workflowNodeAssignee.deleteMany({ where: { workflowNodeId: nodeId } });
  if (assigneeId) {
    await prisma.workflowNodeAssignee.create({
      data: { workflowNodeId: nodeId, userId: assigneeId, responsibility: null },
    });
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  scheduleTaskRollupRevalidate(projectId);
}

/** All leaf nodes under `rootId` (including `rootId` when it has no children). */
async function collectLeafIdsInSubtree(projectId: string, rootId: string): Promise<string[]> {
  const all = await prisma.workflowNode.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true, parentNodeId: true },
  });
  const byParent = new Map<string | null, string[]>();
  for (const n of all) {
    const k = n.parentNodeId;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(n.id);
  }
  const leaves: string[] = [];
  function walk(id: string) {
    const kids = byParent.get(id) ?? [];
    if (!kids.length) leaves.push(id);
    else for (const c of kids) walk(c);
  }
  walk(rootId);
  return leaves;
}

export async function toggleProjectTaskLeafAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.workflow.update");
  const projectId = requireString(formData, "projectId");
  await requireProjectForTasks(user, projectId);
  const nodeId = requireString(formData, "nodeId");

  const node = await prisma.workflowNode.findFirst({
    where: { id: nodeId, projectId, deletedAt: null },
  });
  if (!node) throw new Error("Not found");

  const leafIds = await collectLeafIdsInSubtree(projectId, nodeId);
  if (!leafIds.length) throw new Error("Nothing to toggle");

  const leaves = await prisma.workflowNode.findMany({
    where: { id: { in: leafIds }, projectId, deletedAt: null },
    select: { status: true },
  });
  const allDone =
    leaves.length > 0 &&
    leaves.every((l) => l.status === WorkflowNodeStatus.DONE || l.status === WorkflowNodeStatus.SKIPPED);

  const targetDone = !allDone;
  await prisma.workflowNode.updateMany({
    where: { id: { in: leafIds } },
    data: targetDone
      ? { status: WorkflowNodeStatus.DONE, progressPercent: 100 }
      : { status: WorkflowNodeStatus.NOT_STARTED, progressPercent: 0 },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  scheduleTaskRollupRevalidate(projectId);
}

export async function deleteProjectTaskAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.workflow.update");
  const projectId = requireString(formData, "projectId");
  await requireProjectForTasks(user, projectId);
  const nodeId = requireString(formData, "nodeId");

  const targets = await prisma.workflowNode.findMany({
    where: { projectId, deletedAt: null, OR: [{ id: nodeId }, { parentNodeId: nodeId }] },
    select: { id: true },
  });
  const nodeIds = targets.map((t) => t.id);
  const now = new Date();
  await prisma.workflowNode.updateMany({
    where: { id: { in: nodeIds } },
    data: { deletedAt: now },
  });

  const session = await getAppSession();
  session.taskUndo = { projectId, mode: "nodes", nodeIds };
  await session.save();

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  scheduleTaskRollupRevalidate(projectId);
}

export async function deleteAllProjectTasksAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.workflow.update");
  const projectId = requireString(formData, "projectId");
  const project = await requireProjectForTasks(user, projectId);
  if (!canManageProject(user, project) && !canEditWorkflow(user, project)) {
    throw new Error("Forbidden");
  }

  const targets = await prisma.workflowNode.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true },
  });
  const nodeIds = targets.map((t) => t.id);
  const now = new Date();
  await prisma.workflowNode.updateMany({
    where: { id: { in: nodeIds } },
    data: { deletedAt: now },
  });
  const session = await getAppSession();
  session.taskUndo = { projectId, mode: "nodes", nodeIds };
  await session.save();

  await prisma.project.update({ where: { id: projectId }, data: { progressPercent: 0 } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  scheduleTaskRollupRevalidate(projectId);
}

export async function undoLastProjectTaskDeletionAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.workflow.update");
  const projectId = requireString(formData, "projectId");
  await requireProjectForTasks(user, projectId);

  const session = await getAppSession();
  const u = session.taskUndo;
  if (!u || u.projectId !== projectId) {
    throw new Error("Nothing to undo");
  }

  if (u.mode === "nodes") {
    if (!u.nodeIds.length) throw new Error("Nothing to undo");
    await prisma.workflowNode.updateMany({
      where: { projectId, id: { in: u.nodeIds } },
      data: { deletedAt: null },
    });
  } else {
    const t = new Date(u.deletedAtISO);
    await prisma.workflowNode.updateMany({
      where: { projectId, deletedAt: t },
      data: { deletedAt: null },
    });
  }

  delete session.taskUndo;
  await session.save();

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  scheduleTaskRollupRevalidate(projectId);
}
