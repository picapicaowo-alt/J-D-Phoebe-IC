"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { Prisma, WorkflowNodeLabel, WorkflowNodeStatus, WorkflowNodeType } from "@prisma/client";
import { getAppSession, requireUser } from "@/lib/auth";
import { canEditWorkflow, canManageProject, canViewProject, type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { projectProgressPercentForStatusWithoutTasks, syncProjectTaskRollups } from "@/lib/project-task-progress";
import { parseDatetimeLocalInTimeZone } from "@/lib/timezone";
import {
  APPROVAL_OUTCOME_LABELS,
  PENDING_APPROVAL_LABELS,
  WAITING_LABELS,
  hasAnyOperationalLabel,
  normalizeOperationalLabels,
} from "@/lib/workflow-node-operations";

type DbClient = Prisma.TransactionClient | typeof prisma;

type WorkflowNodeNotificationSnapshot = {
  id: string;
  title: string;
  projectId: string;
  nodeType: WorkflowNodeType;
  status: WorkflowNodeStatus;
  operationalLabels: WorkflowNodeLabel[];
  waitingStartedAt: Date | null;
  waitingOnUserId: string | null;
  waitingOnUsers: { userId: string }[];
  waitingOnExternalName: string | null;
  waitingDetails: string | null;
  approverUserId: string | null;
  approvalRequestedAt: Date | null;
  approvalCompletedAt: Date | null;
};

type ParsedOperationalInput = {
  status: WorkflowNodeStatus;
  operationalLabels: WorkflowNodeLabel[];
  waitingStartedAt: Date | null;
  waitingOnUserIds: string[];
  waitingOnUserId: string | null;
  waitingOnExternalName: string | null;
  waitingDetails: string | null;
  approvalRequestedAt: Date | null;
  approvalCompletedAt: Date | null;
  approverUserId: string | null;
  nextAction: string | null;
  isProjectBottleneck: boolean;
};

type ProjectStaffDirectoryEntry = {
  id: string;
  name: string;
  email: string;
};

/** Run rollup + second revalidate after the response is sent so mutations return fast (avoids Vercel / PgBouncer timeouts). */
function scheduleTaskRollupRevalidate(projectId: string) {
  after(async () => {
    try {
      await syncProjectTaskRollups(projectId);
      revalidatePath(`/projects/${projectId}`);
      revalidatePath("/projects");
      revalidatePath("/calendar");
    } catch (err) {
      console.error("[syncProjectTaskRollups]", projectId, err);
    }
  });
}

const workflowNodeNotificationSelect = {
  id: true,
  title: true,
  projectId: true,
  nodeType: true,
  status: true,
  operationalLabels: true,
  waitingStartedAt: true,
  waitingOnUserId: true,
  waitingOnUsers: { select: { userId: true } },
  waitingOnExternalName: true,
  waitingDetails: true,
  approverUserId: true,
  approvalRequestedAt: true,
  approvalCompletedAt: true,
} as const;

function requireString(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

function parseOptionalDate(formData: FormData, key = "dueAt", timeZone?: string): Date | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  if (timeZone) {
    const zoned = parseDatetimeLocalInTimeZone(raw, timeZone);
    if (zoned) return zoned;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseNodeStatus(formData: FormData, key = "status") {
  const raw = String(formData.get(key) ?? "").trim();
  const allowed: WorkflowNodeStatus[] = ["NOT_STARTED", "IN_PROGRESS", "WAITING", "BLOCKED", "APPROVED", "DONE", "SKIPPED"];
  return allowed.includes(raw as WorkflowNodeStatus) ? (raw as WorkflowNodeStatus) : WorkflowNodeStatus.NOT_STARTED;
}

async function listProjectStaffDirectory(db: DbClient, projectId: string): Promise<ProjectStaffDirectoryEntry[]> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      ownerId: true,
      company: { select: { orgGroupId: true } },
      memberships: { select: { userId: true } },
    },
  });

  if (!project) return [];

  const mustIncludeUserIds = [...new Set([project.ownerId, ...project.memberships.map((membership) => membership.userId)])];

  return db.user.findMany({
    where: {
      deletedAt: null,
      OR: [
        { id: { in: mustIncludeUserIds } },
        {
          active: true,
          OR: [
            { groupMemberships: { some: { orgGroupId: project.company.orgGroupId } } },
            { companyMemberships: { some: { company: { orgGroupId: project.company.orgGroupId } } } },
            { projectMemberships: { some: { project: { company: { orgGroupId: project.company.orgGroupId } } } } },
          ],
        },
      ],
    },
    select: { id: true, name: true, email: true },
  });
}

function resolveMentionedUserIdFromDirectory(directory: ProjectStaffDirectoryEntry[], mentionRaw: string | null) {
  const mention = mentionRaw?.trim();
  if (!mention) return null;
  const normalized = mention.replace(/^@+/, "").trim().toLowerCase();
  if (!normalized) return null;

  const match = directory.find((person) => {
    const name = person.name.trim().toLowerCase();
    const email = person.email.trim().toLowerCase();
    return name === normalized || email === normalized || `@${name}` === `@${normalized}`;
  });

  return match?.id ?? null;
}

function filterDirectoryUserIds(directory: ProjectStaffDirectoryEntry[], rawUserIds: string[]) {
  const uniqueUserIds = [...new Set(rawUserIds.map((value) => value.trim()).filter(Boolean))];
  if (!uniqueUserIds.length) return [] as string[];
  const allowedUserIds = new Set(directory.map((person) => person.id));
  return uniqueUserIds.filter((userId) => allowedUserIds.has(userId));
}

function isWorkflowNodeDone(status: WorkflowNodeStatus) {
  return status === WorkflowNodeStatus.DONE || status === WorkflowNodeStatus.SKIPPED;
}

function isWaitingNotificationState(
  state: Pick<
    WorkflowNodeNotificationSnapshot,
    "status" | "operationalLabels" | "waitingStartedAt" | "waitingOnUserId" | "waitingOnUsers" | "waitingOnExternalName" | "waitingDetails"
  >,
) {
  return (
    state.status === WorkflowNodeStatus.WAITING ||
    hasAnyOperationalLabel(state.operationalLabels, WAITING_LABELS) ||
    !!state.waitingStartedAt ||
    !!state.waitingOnUserId ||
    !!state.waitingOnUsers.length ||
    !!state.waitingOnExternalName ||
    !!state.waitingDetails
  );
}

function isPendingApprovalNotificationState(
  state: Pick<
    WorkflowNodeNotificationSnapshot,
    "nodeType" | "status" | "operationalLabels" | "approverUserId" | "approvalRequestedAt" | "approvalCompletedAt"
  >,
) {
  return (
    hasAnyOperationalLabel(state.operationalLabels, PENDING_APPROVAL_LABELS) ||
    (state.nodeType === WorkflowNodeType.APPROVAL && !isWorkflowNodeDone(state.status) && state.status !== WorkflowNodeStatus.APPROVED) ||
    ((!state.approvalCompletedAt && state.status !== WorkflowNodeStatus.APPROVED) && (!!state.approverUserId || !!state.approvalRequestedAt))
  );
}

function collectWaitingRecipientIds(state: Pick<WorkflowNodeNotificationSnapshot, "waitingOnUserId" | "waitingOnUsers">) {
  return [...new Set([...state.waitingOnUsers.map((link) => link.userId), state.waitingOnUserId].filter(Boolean) as string[])];
}

async function createTaskOperationalNotifications(args: {
  tx: Prisma.TransactionClient;
  actorUserId: string;
  projectName: string;
  nodeId: string;
  nodeTitle: string;
  previousState: WorkflowNodeNotificationSnapshot | null;
  nextState: WorkflowNodeNotificationSnapshot;
}) {
  const { tx, actorUserId, projectName, nodeId, nodeTitle, previousState, nextState } = args;
  const href = `/projects/${nextState.projectId}?task=${nodeId}#task-${nodeId}`;

  const previousWaitingActive = previousState ? isWaitingNotificationState(previousState) : false;
  const nextWaitingActive = isWaitingNotificationState(nextState);
  const previousWaitingRecipients = previousState ? new Set(collectWaitingRecipientIds(previousState)) : new Set<string>();
  const waitingRecipientsToNotify = nextWaitingActive
    ? collectWaitingRecipientIds(nextState).filter((userId) => userId !== actorUserId && (!previousWaitingActive || !previousWaitingRecipients.has(userId)))
    : [];

  if (waitingRecipientsToNotify.length) {
    await tx.inAppNotification.createMany({
      data: waitingRecipientsToNotify.map((userId) => ({
        userId,
        kind: "TASK_WAITING_RESPONSE",
        title: "Response needed on a project task",
        body: `${projectName} · ${nodeTitle}`,
        href,
        metadata: { projectId: nextState.projectId, nodeId, category: "waiting" },
      })),
    });
  }

  const previousApprovalActive = previousState ? isPendingApprovalNotificationState(previousState) : false;
  const nextApprovalActive = isPendingApprovalNotificationState(nextState);
  const approvalRecipientChanged = previousState?.approverUserId !== nextState.approverUserId;
  const approvalRecipientToNotify =
    nextApprovalActive && nextState.approverUserId && nextState.approverUserId !== actorUserId && (!previousApprovalActive || approvalRecipientChanged)
      ? nextState.approverUserId
      : null;

  if (approvalRecipientToNotify) {
    await tx.inAppNotification.create({
      data: {
        userId: approvalRecipientToNotify,
        kind: "TASK_PENDING_APPROVAL",
        title: "Approval requested on a project task",
        body: `${projectName} · ${nodeTitle}`,
        href,
        metadata: { projectId: nextState.projectId, nodeId, category: "approval" },
      },
    });
  }
}

async function parseOperationalInput(
  formData: FormData,
  projectId: string,
  timeZone: string,
  opts?: { nodeType?: WorkflowNodeType },
  db: DbClient = prisma,
): Promise<ParsedOperationalInput> {
  const status = parseNodeStatus(formData);
  const operationalLabels = normalizeOperationalLabels(formData.getAll("operationalLabels").map((value) => String(value).trim()));
  const waitingStartedInput = parseOptionalDate(formData, "waitingStartedAt", timeZone);
  const waitingOnUserMention = String(formData.get("waitingOnUserMention") ?? "").trim() || null;
  const waitingOnExternalNameInput = String(formData.get("waitingOnExternalName") ?? "").trim() || null;
  const waitingDetailsInput = String(formData.get("waitingDetails") ?? "").trim() || null;
  const rawWaitingOnUserIds = formData.getAll("waitingOnUserIds").map((value) => String(value));
  const hasWaitingIntent =
    !!waitingStartedInput || !!waitingOnUserMention || !!waitingOnExternalNameInput || !!waitingDetailsInput || rawWaitingOnUserIds.some((value) => value.trim());
  const hasWaitingState = status === "WAITING" || hasAnyOperationalLabel(operationalLabels, WAITING_LABELS) || hasWaitingIntent;
  const hasApprovalState =
    opts?.nodeType === "APPROVAL" ||
    hasAnyOperationalLabel(operationalLabels, PENDING_APPROVAL_LABELS) ||
    hasAnyOperationalLabel(operationalLabels, APPROVAL_OUTCOME_LABELS) ||
    !!String(formData.get("approverUserId") ?? "").trim() ||
    !!parseOptionalDate(formData, "approvalRequestedAt", timeZone) ||
    !!parseOptionalDate(formData, "approvalCompletedAt", timeZone);
  let staffDirectoryPromise: Promise<ProjectStaffDirectoryEntry[]> | null = null;
  const getStaffDirectory = () => {
    if (!staffDirectoryPromise) {
      staffDirectoryPromise = listProjectStaffDirectory(db, projectId);
    }
    return staffDirectoryPromise;
  };

  const waitingStartedAt = hasWaitingState ? parseOptionalDate(formData, "waitingStartedAt", timeZone) ?? new Date() : null;
  const waitingOnUserIds = hasWaitingState ? filterDirectoryUserIds(await getStaffDirectory(), rawWaitingOnUserIds) : [];
  const fallbackWaitingOnUserId =
    hasWaitingState && waitingOnUserMention ? resolveMentionedUserIdFromDirectory(await getStaffDirectory(), waitingOnUserMention) : null;
  const normalizedWaitingOnUserIds = [...new Set([...waitingOnUserIds, fallbackWaitingOnUserId].filter(Boolean) as string[])];
  const waitingOnExternalName = hasWaitingState ? waitingOnExternalNameInput : null;
  const waitingDetails = hasWaitingState ? waitingDetailsInput : null;

  const approvalRequestedAt = hasApprovalState ? parseOptionalDate(formData, "approvalRequestedAt", timeZone) ?? new Date() : null;
  const approvalCompletedAt = hasApprovalState ? parseOptionalDate(formData, "approvalCompletedAt", timeZone) : null;
  const [approverUserId] = hasApprovalState
    ? filterDirectoryUserIds(await getStaffDirectory(), [String(formData.get("approverUserId") ?? "").trim()])
    : [];

  return {
    status,
    operationalLabels,
    waitingStartedAt,
    waitingOnUserIds: normalizedWaitingOnUserIds,
    waitingOnUserId: normalizedWaitingOnUserIds[0] ?? null,
    waitingOnExternalName,
    waitingDetails,
    approvalRequestedAt,
    approvalCompletedAt,
    approverUserId,
    nextAction: String(formData.get("nextAction") ?? "").trim() || null,
    isProjectBottleneck: String(formData.get("isProjectBottleneck") ?? "").trim() === "on",
  };
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
  const project = await requireProjectForTasks(user, projectId);
  const title = requireString(formData, "title");
  const assigneeId = String(formData.get("assigneeId") ?? "").trim() || null;
  const dueAt = parseOptionalDate(formData, "dueAt", user.timezone);
  const operationalInput = await parseOperationalInput(formData, projectId, user.timezone, { nodeType: WorkflowNodeType.TASK });

  const layerId = await defaultLayerId(projectId);
  const maxSort = await prisma.workflowNode.aggregate({
    where: { projectId, parentNodeId: null, deletedAt: null },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

  await prisma.$transaction(async (tx) => {
    const node = await tx.workflowNode.create({
      data: {
        projectId,
        layerId,
        parentNodeId: null,
        nodeType: WorkflowNodeType.TASK,
        title,
        status: operationalInput.status,
        progressPercent: 0,
        sortOrder,
        dueAt,
        operationalLabels: operationalInput.operationalLabels,
        waitingStartedAt: operationalInput.waitingStartedAt,
        waitingOnUserId: operationalInput.waitingOnUserId,
        waitingOnExternalName: operationalInput.waitingOnExternalName,
        waitingDetails: operationalInput.waitingDetails,
        waitingOnUsers: {
          create: operationalInput.waitingOnUserIds.map((userId) => ({ userId })),
        },
        approverUserId: operationalInput.approverUserId,
        approvalRequestedAt: operationalInput.approvalRequestedAt,
        approvalCompletedAt: operationalInput.approvalCompletedAt,
        nextAction: operationalInput.nextAction,
        isProjectBottleneck: operationalInput.isProjectBottleneck,
      },
      select: workflowNodeNotificationSelect,
    });

    if (assigneeId) {
      await tx.workflowNodeAssignee.upsert({
        where: { workflowNodeId_userId: { workflowNodeId: node.id, userId: assigneeId } },
        create: { workflowNodeId: node.id, userId: assigneeId, responsibility: null },
        update: {},
      });
    }

    await createTaskOperationalNotifications({
      tx,
      actorUserId: user.id,
      projectName: project.name,
      nodeId: node.id,
      nodeTitle: node.title,
      previousState: null,
      nextState: node,
    });
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/calendar");
  scheduleTaskRollupRevalidate(projectId);
}

export async function addProjectSubtaskAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.workflow.update");
  const projectId = requireString(formData, "projectId");
  const project = await requireProjectForTasks(user, projectId);
  const parentNodeId = requireString(formData, "parentNodeId");
  const title = requireString(formData, "title");
  const assigneeId = String(formData.get("assigneeId") ?? "").trim() || null;
  const dueAt = parseOptionalDate(formData, "dueAt", user.timezone);
  const operationalInput = await parseOperationalInput(formData, projectId, user.timezone, { nodeType: WorkflowNodeType.TASK });

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

  await prisma.$transaction(async (tx) => {
    const sub = await tx.workflowNode.create({
      data: {
        projectId,
        layerId: parent.layerId,
        parentNodeId,
        nodeType: WorkflowNodeType.TASK,
        title,
        status: operationalInput.status,
        progressPercent: 0,
        sortOrder,
        dueAt,
        operationalLabels: operationalInput.operationalLabels,
        waitingStartedAt: operationalInput.waitingStartedAt,
        waitingOnUserId: operationalInput.waitingOnUserId,
        waitingOnExternalName: operationalInput.waitingOnExternalName,
        waitingDetails: operationalInput.waitingDetails,
        waitingOnUsers: {
          create: operationalInput.waitingOnUserIds.map((userId) => ({ userId })),
        },
        approverUserId: operationalInput.approverUserId,
        approvalRequestedAt: operationalInput.approvalRequestedAt,
        approvalCompletedAt: operationalInput.approvalCompletedAt,
        nextAction: operationalInput.nextAction,
        isProjectBottleneck: operationalInput.isProjectBottleneck,
      },
      select: workflowNodeNotificationSelect,
    });

    if (assigneeId) {
      await tx.workflowNodeAssignee.upsert({
        where: { workflowNodeId_userId: { workflowNodeId: sub.id, userId: assigneeId } },
        create: { workflowNodeId: sub.id, userId: assigneeId, responsibility: null },
        update: {},
      });
    }

    await createTaskOperationalNotifications({
      tx,
      actorUserId: user.id,
      projectName: project.name,
      nodeId: sub.id,
      nodeTitle: sub.title,
      previousState: null,
      nextState: sub,
    });
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/calendar");
  scheduleTaskRollupRevalidate(projectId);
}

export async function updateWorkflowNodeMetaAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.workflow.update");
  const projectId = requireString(formData, "projectId");
  const project = await requireProjectForTasks(user, projectId);
  const nodeId = requireString(formData, "nodeId");

  const node = await prisma.workflowNode.findFirst({
    where: { id: nodeId, projectId, deletedAt: null },
    select: { ...workflowNodeNotificationSelect, description: true, dueAt: true },
  });
  if (!node) throw new Error("Not found");

  const description = String(formData.get("description") ?? "").trim() || null;
  const dueAt = parseOptionalDate(formData, "dueAt", user.timezone);
  const assigneeId = String(formData.get("assigneeId") ?? "").trim();
  const operationalInput = await parseOperationalInput(formData, projectId, user.timezone, { nodeType: node.nodeType });

  await prisma.$transaction(async (tx) => {
    const updatedNode = await tx.workflowNode.update({
      where: { id: nodeId },
      data: {
        description,
        dueAt,
        status: operationalInput.status,
        operationalLabels: operationalInput.operationalLabels,
        waitingStartedAt: operationalInput.waitingStartedAt,
        waitingOnUserId: operationalInput.waitingOnUserId,
        waitingOnExternalName: operationalInput.waitingOnExternalName,
        waitingDetails: operationalInput.waitingDetails,
        waitingOnUsers: {
          deleteMany: {},
          create: operationalInput.waitingOnUserIds.map((userId) => ({ userId })),
        },
        approverUserId: operationalInput.approverUserId,
        approvalRequestedAt: operationalInput.approvalRequestedAt,
        approvalCompletedAt: operationalInput.approvalCompletedAt,
        nextAction: operationalInput.nextAction,
        isProjectBottleneck: operationalInput.isProjectBottleneck,
      },
      select: workflowNodeNotificationSelect,
    });

    await tx.workflowNodeAssignee.deleteMany({ where: { workflowNodeId: nodeId } });
    if (assigneeId) {
      await tx.workflowNodeAssignee.create({
        data: { workflowNodeId: nodeId, userId: assigneeId, responsibility: null },
      });
    }

    await createTaskOperationalNotifications({
      tx,
      actorUserId: user.id,
      projectName: project.name,
      nodeId: updatedNode.id,
      nodeTitle: updatedNode.title,
      previousState: node,
      nextState: updatedNode,
    });
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/calendar");
  scheduleTaskRollupRevalidate(projectId);
}

export async function updateWorkflowNodeDetailsAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.workflow.update");
  const projectId = requireString(formData, "projectId");
  const project = await requireProjectForTasks(user, projectId);
  const nodeId = requireString(formData, "nodeId");

  const node = await prisma.workflowNode.findFirst({
    where: { id: nodeId, projectId, deletedAt: null },
    select: { ...workflowNodeNotificationSelect, description: true, dueAt: true },
  });
  if (!node) throw new Error("Not found");

  const description = String(formData.get("description") ?? "").trim() || null;
  const dueAt = parseOptionalDate(formData, "dueAt", user.timezone);
  const assigneeId = String(formData.get("assigneeId") ?? "").trim();
  const status = parseNodeStatus(formData);

  await prisma.$transaction(async (tx) => {
    const updatedNode = await tx.workflowNode.update({
      where: { id: nodeId },
      data: {
        description,
        dueAt,
        status,
      },
      select: workflowNodeNotificationSelect,
    });

    await tx.workflowNodeAssignee.deleteMany({ where: { workflowNodeId: nodeId } });
    if (assigneeId) {
      await tx.workflowNodeAssignee.create({
        data: { workflowNodeId: nodeId, userId: assigneeId, responsibility: null },
      });
    }

    await createTaskOperationalNotifications({
      tx,
      actorUserId: user.id,
      projectName: project.name,
      nodeId: updatedNode.id,
      nodeTitle: updatedNode.title,
      previousState: node,
      nextState: updatedNode,
    });
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/calendar");
  scheduleTaskRollupRevalidate(projectId);
}

export async function updateWorkflowNodeOperationalAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.workflow.update");
  const projectId = requireString(formData, "projectId");
  const project = await requireProjectForTasks(user, projectId);
  const nodeId = requireString(formData, "nodeId");

  const node = await prisma.workflowNode.findFirst({
    where: { id: nodeId, projectId, deletedAt: null },
    select: workflowNodeNotificationSelect,
  });
  if (!node) throw new Error("Not found");

  await prisma.$transaction(async (tx) => {
    const operationalInput = await parseOperationalInput(formData, projectId, user.timezone, { nodeType: node.nodeType }, tx);

    const updatedNode = await tx.workflowNode.update({
      where: { id: nodeId },
      data: {
        operationalLabels: operationalInput.operationalLabels,
        waitingStartedAt: operationalInput.waitingStartedAt,
        waitingOnUserId: operationalInput.waitingOnUserId,
        waitingOnExternalName: operationalInput.waitingOnExternalName,
        waitingDetails: operationalInput.waitingDetails,
        waitingOnUsers: {
          deleteMany: {},
          create: operationalInput.waitingOnUserIds.map((userId) => ({ userId })),
        },
        approverUserId: operationalInput.approverUserId,
        approvalRequestedAt: operationalInput.approvalRequestedAt,
        approvalCompletedAt: operationalInput.approvalCompletedAt,
        nextAction: operationalInput.nextAction,
        isProjectBottleneck: operationalInput.isProjectBottleneck,
      },
      select: workflowNodeNotificationSelect,
    });

    await createTaskOperationalNotifications({
      tx,
      actorUserId: user.id,
      projectName: project.name,
      nodeId: updatedNode.id,
      nodeTitle: updatedNode.title,
      previousState: node,
      nextState: updatedNode,
    });
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/calendar");
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
    where: { id: { in: leafIds }, projectId, deletedAt: null },
    data: targetDone
      ? { status: WorkflowNodeStatus.DONE, progressPercent: 100 }
      : { status: WorkflowNodeStatus.NOT_STARTED, progressPercent: 0 },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/calendar");
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
    where: { id: { in: nodeIds }, projectId, deletedAt: null },
    data: { deletedAt: now },
  });

  const session = await getAppSession();
  session.taskUndo = { projectId, mode: "nodes", nodeIds };
  await session.save();

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/calendar");
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

  await prisma.project.update({
    where: { id: projectId },
    data: { progressPercent: projectProgressPercentForStatusWithoutTasks(project.status) },
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/calendar");
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
  revalidatePath("/calendar");
  scheduleTaskRollupRevalidate(projectId);
}
