import Link from "next/link";
import { notFound } from "next/navigation";
import { KnowledgeLayer, Priority, ProjectRelationType, ProjectStatus, WorkflowNodeLabel, WorkflowNodeStatus } from "@prisma/client";
import { assignMultipleToProjectAction, removeProjectMembershipAction } from "@/app/actions/staff";
import { softDeleteProjectAction } from "@/app/actions/trash";
import {
  addProjectRelationAction,
  archiveProjectAction,
  removeProjectRelationAction,
  restoreProjectAction,
  updateProjectRelationNoteAction,
  updateProjectAction,
} from "@/app/actions/project";
import {
  toggleProjectRelationShareAttachmentAction,
  toggleProjectRelationShareKnowledgeAction,
} from "@/app/actions/project-relation-share";
import { createKnowledgeAssetAction, softDeleteKnowledgeAssetAction, updateKnowledgeAssetAction } from "@/app/actions/knowledge";
import { addExternalResourceLinkAction, updateProjectExternalLinkAction } from "@/app/actions/attachments";
import { softDeleteAttachmentAction } from "@/app/actions/attachment-trash";
import { getAppSession, requireUser } from "@/lib/auth";
import { canEditWorkflow, canManageProject, canViewProject, projectVisibilityWhere, type AccessUser } from "@/lib/access";
import { getLocale } from "@/lib/locale";
import { t, tKnowledgeLayer, tPriority, tProjectRelationType, tProjectStatus, tWorkflowNodeStatus } from "@/lib/messages";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { calendarHref } from "@/lib/calendar-nav";
import { countdownPhrase, isOverdue, toDatetimeLocalValue } from "@/lib/deadlines";
import { AttachmentVersionTree } from "@/components/attachment-version-tree";
import { CloseDialogButton, OpenDialogButton } from "@/components/dialog-launcher";
import { UserFace } from "@/components/user-face";
import { DetailsHashOpener } from "@/components/details-hash-opener";
import { type ProjectTaskRow } from "@/components/project-tasks-panel";
import {
  formatWorkflowNodeLabel,
  getApprovalOwnerDisplay,
  getOperationalNextAction,
  getWaitingEscalation,
  getWaitingOnDisplay,
  isAtRiskNode,
  isBlockedNode,
  isOverdueNode,
  isPendingApprovalNode,
} from "@/lib/workflow-node-operations";
import {
  ProjectProgressBar,
  ProjectProgressDisplay,
  ProjectProgressProvider,
  ProjectTasksPanelWithProgress,
} from "@/components/project-progress-bridge";
import type { Locale } from "@/lib/locale";

const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUSES: ProjectStatus[] = [
  "PLANNING",
  "ACTIVE",
  "AT_RISK",
  "ON_HOLD",
  "COMPLETED",
  "ARCHIVED",
  "CANCELLED",
];

const RELATION_TYPES: ProjectRelationType[] = [
  "INDEPENDENT",
  "PARENT_CHILD",
  "LINKED",
  "DEPENDS_ON",
  "CROSS_COMPANY",
  "SHARED_ASSET",
];

const KNOWLEDGE_LAYERS: KnowledgeLayer[] = [
  "TEMPLATE_PLAYBOOK",
  "REFERENCE_RESOURCE",
  "INTERNAL_INSIGHT",
  "REUSABLE_OUTPUT",
];

const TASK_STATUS_OPTIONS: WorkflowNodeStatus[] = ["NOT_STARTED", "IN_PROGRESS", "WAITING", "BLOCKED", "APPROVED", "DONE", "SKIPPED"];
const TASK_LABEL_OPTIONS: WorkflowNodeLabel[] = [
  "WAITING_ON_RESPONSE",
  "WAITING_ON_INTERNAL_TEAM_MEMBER",
  "WAITING_ON_EXTERNAL_PARTY",
  "WAITING_ON_CLIENT",
  "WAITING_ON_VENDOR_PARTNER",
  "WAITING_ON_DOCUMENT_MATERIAL",
  "PENDING_APPROVAL",
  "UNDER_REVIEW",
  "APPROVED",
  "NEEDS_REVISION",
  "REJECTED",
  "AT_RISK",
  "BLOCKED",
  "OVERDUE",
  "PAUSED",
];

type TaskNodeRow = {
  id: string;
  title: string;
  parentNodeId: string | null;
  progressPercent: number;
  status: WorkflowNodeStatus;
  sortOrder: number;
  dueAt: Date | null;
  description: string | null;
  operationalLabels: WorkflowNodeLabel[];
  waitingStartedAt: Date | null;
  waitingOnUserId: string | null;
  waitingOnExternalName: string | null;
  waitingDetails: string | null;
  approverUserId: string | null;
  approvalRequestedAt: Date | null;
  approvalCompletedAt: Date | null;
  nextAction: string | null;
  isProjectBottleneck: boolean;
  waitingOnUser: { id: string; name: string } | null;
  approverUser: { id: string; name: string } | null;
  assignees: { user: { id: string; name: string } }[];
};

function buildProjectTaskRows(nodes: TaskNodeRow[]): ProjectTaskRow[] {
  const byParent = new Map<string | null, TaskNodeRow[]>();
  for (const n of nodes) {
    const k = n.parentNodeId;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(n);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  function walk(parentId: string | null): ProjectTaskRow[] {
    return (byParent.get(parentId) ?? []).map((n) => ({
      id: n.id,
      title: n.title,
      progressPercent: n.progressPercent,
      status: n.status,
      assigneeName: n.assignees[0]?.user?.name ?? null,
      assigneeId: n.assignees[0]?.user?.id ?? null,
      dueAt: n.dueAt ? n.dueAt.toISOString() : null,
      description: n.description ?? null,
      operationalLabels: n.operationalLabels,
      waitingStartedAt: n.waitingStartedAt ? n.waitingStartedAt.toISOString() : null,
      waitingOnUserId: n.waitingOnUserId,
      waitingOnUserName: n.waitingOnUser?.name ?? null,
      waitingOnExternalName: n.waitingOnExternalName,
      waitingDetails: n.waitingDetails,
      approverId: n.approverUserId,
      approverName: n.approverUser?.name ?? null,
      approvalRequestedAt: n.approvalRequestedAt ? n.approvalRequestedAt.toISOString() : null,
      approvalCompletedAt: n.approvalCompletedAt ? n.approvalCompletedAt.toISOString() : null,
      nextAction: n.nextAction,
      isProjectBottleneck: n.isProjectBottleneck,
      children: walk(n.id),
    }));
  }
  return walk(null);
}

function daysLeftLine(deadline: Date | null, locale: Locale) {
  if (!deadline) return { text: t(locale, "projDaysLeftNone"), urgent: false };
  const days = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
  if (days < 0) return { text: t(locale, "projOverdue"), urgent: true };
  return {
    text: t(locale, "projDaysLeftCount").replace("{n}", String(Math.max(0, days))),
    urgent: days <= 7,
  };
}

function priorityTone(p: Priority): string {
  if (p === "URGENT" || p === "HIGH") {
    return "bg-rose-600 text-white ring-1 ring-rose-600/30";
  }
  if (p === "MEDIUM") {
    return "bg-amber-500/90 text-amber-950 ring-1 ring-amber-500/40";
  }
  return "bg-zinc-200 text-zinc-800 ring-1 ring-zinc-300 dark:bg-zinc-700 dark:text-zinc-100";
}

function findTaskById(rows: ProjectTaskRow[], taskId: string | null): ProjectTaskRow | null {
  if (!taskId) return null;
  for (const row of rows) {
    if (row.id === taskId) return row;
    const child = findTaskById(row.children, taskId);
    if (child) return child;
  }
  return null;
}

function formatShortDate(dateLike: string | null, locale: Locale) {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-GB", { year: "numeric", month: "short", day: "numeric" });
}

function TaskSpotlightCard({
  task,
  projectId,
  projectName,
  locale,
}: {
  task: ProjectTaskRow;
  projectId: string;
  projectName: string;
  locale: Locale;
}) {
  const node = {
    status: task.status,
    dueAt: task.dueAt ? new Date(task.dueAt) : null,
    operationalLabels: task.operationalLabels,
    waitingStartedAt: task.waitingStartedAt ? new Date(task.waitingStartedAt) : null,
    waitingOnUser: task.waitingOnUserName ? { name: task.waitingOnUserName } : null,
    waitingOnExternalName: task.waitingOnExternalName,
    waitingDetails: task.waitingDetails,
    approverUser: task.approverName ? { name: task.approverName } : null,
    approvalRequestedAt: task.approvalRequestedAt ? new Date(task.approvalRequestedAt) : null,
    nextAction: task.nextAction,
  };
  const waitingEscalation = getWaitingEscalation(node);
  const waitingOn = getWaitingOnDisplay(node) ?? "Not recorded";
  const approver = getApprovalOwnerDisplay(node);
  const issue =
    task.waitingDetails?.trim()
      ? task.waitingDetails.trim()
      : isBlockedNode(node)
      ? "This task is blocked."
      : isPendingApprovalNode(node)
        ? "This task is waiting on approval."
        : waitingEscalation?.level === "warning"
          ? "This task has been waiting long enough to need follow-up."
          : isOverdueNode(node)
            ? "This task is overdue."
            : isAtRiskNode(node)
              ? "This task has delivery risk."
              : "This task needs operational follow-up.";

  return (
    <Card className="space-y-4 border-amber-300/70 bg-amber-50/70 p-5 dark:border-amber-900/60 dark:bg-amber-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base font-semibold">Task Spotlight</CardTitle>
          <p className="mt-1 text-sm text-[hsl(var(--muted))]">{projectName}</p>
        </div>
        <Link href={`/projects/${projectId}#task-${task.id}`} className="text-sm font-medium text-[hsl(var(--primary))] hover:underline">
          Jump to task
        </Link>
      </div>
      <div className="space-y-3">
        <div>
          <p className="text-lg font-semibold text-[hsl(var(--foreground))]">{task.title}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={isBlockedNode(node) ? "bad" : isPendingApprovalNode(node) ? "info" : isAtRiskNode(node) ? "warn" : "neutral"}>
              {task.status.replaceAll("_", " ")}
            </Badge>
            {task.isProjectBottleneck ? <Badge tone="bad">Project bottleneck</Badge> : null}
            {task.operationalLabels.map((label) => (
              <Badge key={label} tone={label === "AT_RISK" ? "warn" : label === "BLOCKED" || label === "OVERDUE" ? "bad" : "neutral"}>
                {formatWorkflowNodeLabel(label)}
              </Badge>
            ))}
          </div>
        </div>
        <dl className="grid gap-3 md:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted))]">Issue</dt>
            <dd className="mt-1 text-sm text-[hsl(var(--foreground))]">{issue}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted))]">Belongs to</dt>
            <dd className="mt-1 text-sm text-[hsl(var(--foreground))]">{projectName}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted))]">Current state</dt>
            <dd className="mt-1 text-sm text-[hsl(var(--foreground))]">
              {isBlockedNode(node)
                ? "Blocked"
                : isPendingApprovalNode(node)
                  ? "Pending approval"
                  : waitingEscalation
                    ? waitingEscalation.level === "warning"
                      ? "Waiting / aging"
                      : waitingEscalation.level === "blocked"
                        ? "Waiting / escalated"
                        : "Waiting"
                    : task.status.replaceAll("_", " ")}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted))]">Waiting on</dt>
            <dd className="mt-1 text-sm text-[hsl(var(--foreground))]">{waitingOn}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted))]">How long</dt>
            <dd className="mt-1 text-sm text-[hsl(var(--foreground))]">
              {waitingEscalation ? `${waitingEscalation.days} day${waitingEscalation.days === 1 ? "" : "s"} waiting` : "Not in waiting state"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted))]">Next action</dt>
            <dd className="mt-1 text-sm text-[hsl(var(--foreground))]">{getOperationalNextAction(node)}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[hsl(var(--muted))]">
          {task.assigneeName ? <span>Assignee: {task.assigneeName}</span> : null}
          {approver ? <span>Approver: {approver}</span> : null}
          {task.dueAt ? <span>Due: {formatShortDate(task.dueAt, locale)}</span> : null}
          {task.approvalRequestedAt ? <span>Approval requested: {formatShortDate(task.approvalRequestedAt, locale)}</span> : null}
          {task.approvalCompletedAt ? <span>Approval completed: {formatShortDate(task.approvalCompletedAt, locale)}</span> : null}
        </div>
      </div>
    </Card>
  );
}

const knowledgeAssetSelect = {
  id: true,
  projectId: true,
  companyId: true,
  authorId: true,
  title: true,
  titleEn: true,
  titleZh: true,
  summary: true,
  content: true,
  layer: true,
  tags: true,
  sourceUrl: true,
  author: { select: { id: true, name: true } },
} as const;

const projectAttachmentSelect = {
  id: true,
  previousVersionId: true,
  resourceKind: true,
  externalUrl: true,
  fileName: true,
  description: true,
  createdAt: true,
} as const;

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ task?: string }>;
}) {
  const [user, { projectId }, sp] = await Promise.all([requireUser() as Promise<AccessUser>, params, searchParams]);
  const localePromise = getLocale();
  const sessionPromise = getAppSession();
  const permissionPromise = Promise.all([
    userHasPermission(user, "project.soft_delete"),
    userHasPermission(user, "project.member.manage"),
    userHasPermission(user, "project.workflow.update"),
    userHasPermission(user, "knowledge.create"),
    userHasPermission(user, "knowledge.read"),
    userHasPermission(user, "project.read"),
  ]);

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true,
      name: true,
      description: true,
      companyId: true,
      ownerId: true,
      status: true,
      priority: true,
      deadline: true,
      progressPercent: true,
      departmentId: true,
      projectGroupId: true,
      deletedAt: true,
      company: { select: { id: true, name: true, logoUrl: true, orgGroupId: true } },
      owner: { select: { id: true, name: true, avatarUrl: true } },
      memberships: {
        select: {
          id: true,
          userId: true,
          user: { select: { id: true, name: true, avatarUrl: true, active: true } },
          roleDefinition: { select: { displayName: true } },
        },
      },
      outgoingRelations: {
        select: {
          id: true,
          relationType: true,
          note: true,
          toProject: {
            select: {
              id: true,
              name: true,
              companyId: true,
              company: { select: { id: true, name: true, orgGroupId: true } },
            },
          },
          sharedKnowledge: { select: { knowledgeAsset: { select: { id: true } } } },
          sharedAttachments: { select: { attachment: { select: { id: true } } } },
        },
      },
      incomingRelations: {
        select: {
          id: true,
          relationType: true,
          note: true,
          fromProject: {
            select: {
              id: true,
              name: true,
              companyId: true,
              company: { select: { id: true, name: true, orgGroupId: true } },
            },
          },
          sharedKnowledge: { select: { knowledgeAsset: { select: { id: true } } } },
          sharedAttachments: { select: { attachment: { select: { id: true } } } },
        },
      },
      nodes: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          parentNodeId: true,
          progressPercent: true,
          status: true,
          sortOrder: true,
          dueAt: true,
          description: true,
          operationalLabels: true,
          waitingStartedAt: true,
          waitingOnUserId: true,
          waitingOnExternalName: true,
          waitingDetails: true,
          approverUserId: true,
          approvalRequestedAt: true,
          approvalCompletedAt: true,
          nextAction: true,
          isProjectBottleneck: true,
          waitingOnUser: { select: { id: true, name: true } },
          approverUser: { select: { id: true, name: true } },
          assignees: { select: { user: { select: { id: true, name: true } } } },
        },
      },
    },
  });
  if (!project) notFound();
  if (!canViewProject(user, project)) notFound();

  const canManage = canManageProject(user, project);
  const mustIncludeUserIds = [...new Set([project.ownerId, ...project.memberships.map((m) => m.userId)])];

  const [
    projectFiles,
    ownKnowledge,
    sharedKnowledgeInbound,
    sharedAttachmentInbound,
    projectDepts,
    projectGroupList,
    projectCalendarEvents,
    staff,
    projectRoles,
    relationTargetProjects,
    [canSoftDeletePermission, canMemberManagePermission, canEditTasksPermission, canEditKnowledge, canReadKnowledge, canReadCalendar],
    locale,
    session,
  ] = await Promise.all([
    prisma.attachment.findMany({
      where: {
        projectId: project.id,
        deletedAt: null,
        workflowNodeId: null,
        knowledgeAssetId: null,
        memberOutputId: null,
      },
      orderBy: { createdAt: "desc" },
      select: projectAttachmentSelect,
    }),
    prisma.knowledgeAsset.findMany({
      where: { projectId: project.id, deletedAt: null },
      select: knowledgeAssetSelect,
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.projectRelationSharedKnowledge.findMany({
      where: { relation: { toProjectId: project.id } },
      select: {
        id: true,
        relation: {
          select: {
            fromProject: {
              select: {
                id: true,
                name: true,
                company: { select: { id: true, name: true } },
              },
            },
          },
        },
        knowledgeAsset: { select: knowledgeAssetSelect },
      },
    }),
    prisma.projectRelationSharedAttachment.findMany({
      where: { relation: { toProjectId: project.id } },
      select: {
        id: true,
        relation: {
          select: {
            fromProject: {
              select: {
                id: true,
                name: true,
                company: { select: { id: true, name: true } },
              },
            },
          },
        },
        attachment: { select: projectAttachmentSelect },
      },
    }),
    prisma.department.findMany({
      where: { companyId: project.companyId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.projectGroup.findMany({
      where: { companyId: project.companyId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.calendarEvent.findMany({
      where: { projectId: project.id },
      select: {
        id: true,
        title: true,
        startsAt: true,
        label: { select: { name: true, color: true } },
        organizer: { select: { id: true, name: true } },
      },
      orderBy: { startsAt: "desc" },
      take: 30,
    }),
    prisma.user.findMany({
      where: {
        deletedAt: null,
        OR: [{ id: { in: mustIncludeUserIds } }, { active: true }],
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.roleDefinition.findMany({
      where: { appliesScope: "PROJECT" },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    }),
    prisma.project.findMany({
      where: { deletedAt: null, id: { not: project.id }, ...projectVisibilityWhere(user) },
      select: { id: true, name: true, company: { select: { id: true, name: true } } },
      orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
      take: 120,
    }),
    permissionPromise,
    localePromise,
    sessionPromise,
  ]);

  const canSoftDeleteProject =
    canSoftDeletePermission &&
    (user.isSuperAdmin ||
      user.groupMemberships.some((m) => m.orgGroupId === project.company.orgGroupId && m.roleDefinition.key === "GROUP_ADMIN") ||
      user.companyMemberships.some((m) => m.companyId === project.companyId && m.roleDefinition.key === "COMPANY_ADMIN"));
  const undoAvailable = session.taskUndo?.projectId === project.id;
  const canMemberManage = canMemberManagePermission && canManage;
  const canEditTasks =
    canEditTasksPermission &&
    canViewProject(user, project) &&
    (canManageProject(user, project) ||
      canEditWorkflow(user, project) ||
      user.projectMemberships.some((m) => m.projectId === project.id));

  const relationCount = project.outgoingRelations.length + project.incomingRelations.length;
  const knowledgeTotalCount = ownKnowledge.length + sharedKnowledgeInbound.length;
  const filesTotalCount = projectFiles.length + sharedAttachmentInbound.length;
  const taskRows = buildProjectTaskRows(project.nodes);
  const focusedTask = findTaskById(taskRows, String(sp.task ?? "").trim() || null);
  const daysLeft = daysLeftLine(project.deadline, locale);
  const priorityClass = priorityTone(project.priority);

  const primaryBtn =
    "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium bg-[hsl(var(--accent))] text-white hover:opacity-90";
  const secondaryBtn =
    "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium bg-[hsl(var(--card))] border border-[hsl(var(--border))] hover:bg-black/5 dark:hover:bg-white/5";

  return (
    <div className="space-y-6">
      <DetailsHashOpener />
      <div className="text-xs text-[hsl(var(--muted))]">
        <Link href="/home">{t(locale, "navHome")}</Link> / <Link href="/projects">{t(locale, "projBreadcrumbProjects")}</Link> / {project.name}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/home" className={secondaryBtn}>
          {t(locale, "navHome")}
        </Link>
        {canManage ? (
          <a href="#section-edit-project" className={primaryBtn}>
            {t(locale, "projEditProject")}
          </a>
        ) : null}
        {canMemberManage ? (
          <a href="#section-edit-members" className={canManage ? secondaryBtn : primaryBtn}>
            {t(locale, "projEditMembers")}
          </a>
        ) : null}
        <Link href={`/projects/${project.id}/recognition`} className={secondaryBtn}>
          {t(locale, "projRecognitionOpen")}
        </Link>
        <Link href={`/projects/${project.id}/growth`} className={secondaryBtn}>
          {t(locale, "projGrowthOpen")}
        </Link>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        {project.company.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.company.logoUrl}
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 shrink-0 rounded-md border border-[hsl(var(--border))] bg-white object-contain p-1 dark:bg-zinc-900"
          />
        ) : null}
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">{project.name}</h1>
          {project.description ? (
            <p className="text-sm text-[hsl(var(--muted))]">{project.description}</p>
          ) : null}
          <p className="text-sm text-[hsl(var(--muted))]">
            {project.company.name} · {tProjectStatus(locale, project.status)} · {tPriority(locale, project.priority)}
          </p>
          {project.deadline ? (
            <p className="text-xs text-[hsl(var(--muted))]">
              {countdownPhrase(project.deadline)}
              {isOverdue(project.deadline) && project.status !== "COMPLETED" ? ` · ${t(locale, "projOverdue")}` : ""}
            </p>
          ) : null}
        </div>
      </div>

      {focusedTask ? <TaskSpotlightCard task={focusedTask} projectId={project.id} projectName={project.name} locale={locale} /> : null}

      <ProjectProgressProvider initialTasks={taskRows}>
        <div className="overflow-hidden rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-sm">
          <div className="relative grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="space-y-1">
              <p className="text-xs font-normal text-slate-500 dark:text-slate-400">{t(locale, "commonStatus")}</p>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    project.status === "ACTIVE"
                      ? "bg-emerald-500"
                      : project.status === "COMPLETED"
                        ? "bg-sky-500"
                        : "bg-zinc-400 dark:bg-zinc-500"
                  }`}
                  aria-hidden
                />
                <span className="font-medium text-[hsl(var(--foreground))]">{tProjectStatus(locale, project.status)}</span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-normal text-slate-500 dark:text-slate-400">{t(locale, "commonPriority")}</p>
              <span className={`inline-flex rounded-lg px-2.5 py-0.5 text-xs font-medium ${priorityClass}`}>
                {tPriority(locale, project.priority)}
              </span>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-normal text-slate-500 dark:text-slate-400">{t(locale, "projProgressOverall")}</p>
              <ProjectProgressDisplay />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-normal text-slate-500 dark:text-slate-400">{t(locale, "commonOwner")}</p>
              <span className="flex items-center gap-2 font-medium text-[hsl(var(--foreground))]">
                <UserFace name={project.owner.name} avatarUrl={project.owner.avatarUrl} size={24} />
                {project.owner.name}
              </span>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-normal text-slate-500 dark:text-slate-400">{t(locale, "commonCompany")}</p>
              <p className="font-medium text-[hsl(var(--foreground))]">{project.company.name}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-normal text-slate-500 dark:text-slate-400">{t(locale, "projMetricDaysLeft")}</p>
              <p
                className={`text-sm font-semibold tabular-nums ${
                  daysLeft.urgent ? "text-orange-600 dark:text-orange-400" : "text-[hsl(var(--foreground))]"
                }`}
              >
                {daysLeft.text}
              </p>
            </div>
          </div>
          <ProjectProgressBar />
        </div>

        {canReadCalendar ? (
          <Card className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{t(locale, "projRelatedEventsTitle")}</CardTitle>
              <Link
                href={calendarHref({
                  y: new Date().getFullYear(),
                  m: new Date().getMonth() + 1,
                  view: "month",
                  create: true,
                  defaultProjectId: project.id,
                })}
                className={secondaryBtn}
              >
                {t(locale, "calendarNewEvent")}
              </Link>
            </div>
            {!projectCalendarEvents.length ? (
              <p className="text-base leading-relaxed text-[hsl(var(--muted))]">{t(locale, "projRelatedEventsEmpty")}</p>
            ) : (
              <ul className="divide-y divide-[hsl(var(--border))]">
                {projectCalendarEvents.map((ev) => (
                  <li key={ev.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        {ev.label ? (
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: ev.label.color }}
                            aria-label={ev.label.name}
                          />
                        ) : null}
                        <Link
                          href={calendarHref({
                            y: ev.startsAt.getFullYear(),
                            m: ev.startsAt.getMonth() + 1,
                            view: "month",
                            eventId: ev.id,
                          })}
                          className="font-medium text-[hsl(var(--primary))] hover:underline"
                        >
                          {ev.title}
                        </Link>
                      </div>
                      <p className="mt-1 text-base leading-relaxed text-[hsl(var(--muted))]">
                        {ev.startsAt.toISOString().slice(0, 16).replace("T", " ")} — {ev.organizer.name}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/calendar" className="inline-block text-base font-medium text-[hsl(var(--primary))] hover:underline">
              {t(locale, "projRelatedEventsOpenCalendar")}
            </Link>
          </Card>
        ) : null}

        <ProjectTasksPanelWithProgress
          projectId={project.id}
          tasks={taskRows}
          canEdit={canEditTasks}
          undoAvailable={undoAvailable}
          memberOptions={project.memberships.map((m) => ({ id: m.userId, name: m.user.name }))}
          locale={locale}
          copy={{
            title: t(locale, "wfMapTitle"),
            undo: t(locale, "projTasksUndo"),
            undoHint: t(locale, "projTasksUndoHint"),
            undoDisabledHint: t(locale, "projTasksUndoDisabledHint"),
            deleteAll: t(locale, "projTasksDeleteAll"),
            deleteTask: t(locale, "projTasksDeleteTask"),
            addTask: t(locale, "projTasksAddTask"),
            addSubtask: t(locale, "projTasksAddSubtask"),
            assignedPrefix: t(locale, "projTasksAssignedPrefix"),
            confirmDeleteAll: t(locale, "projTasksConfirmDeleteAll"),
            empty: t(locale, "projTasksNoTasks"),
            noSubtasksHint: t(locale, "projTasksNoSubtasksHint"),
            newTaskPh: t(locale, "projTaskNewTitlePh"),
            newSubPh: t(locale, "projTaskNewSubPh"),
            deadlineOptional: t(locale, "projTaskDeadlineLabel"),
            assignSubOptional: t(locale, "projTaskAssignSub"),
            metaTitle: t(locale, "projTaskMetaTitle"),
            metaLead: t(locale, "projTaskMetaLead"),
            labelsTitle: t(locale, "projTaskLabelsTitle"),
            labelsLead: t(locale, "projTaskLabelsLead"),
            saveMeta: t(locale, "btnSave"),
            dueShort: t(locale, "projTaskDueShort"),
            descriptionLabel: t(locale, "commonDescription"),
            editDetails: t(locale, "projTaskEditDetails"),
            editLabels: t(locale, "projTaskEditLabels"),
            dialogClose: t(locale, "kbDialogClose"),
            statusLabel: t(locale, "commonStatus"),
            labelsLabel: t(locale, "projTaskLabelsLabel"),
            categoryLabel: t(locale, "projTaskCategoryLabel"),
            waitingStartedLabel: t(locale, "projTaskWaitingStartedLabel"),
            waitingOnInternalLabel: t(locale, "projTaskWaitingInternalLabel"),
            waitingOnExternalLabel: t(locale, "projTaskWaitingExternalLabel"),
            waitingDetailsLabel: t(locale, "projTaskWaitingDetailsLabel"),
            approvalRequestedLabel: t(locale, "projTaskApprovalRequestedLabel"),
            approvalCompletedLabel: t(locale, "projTaskApprovalCompletedLabel"),
            approverLabel: t(locale, "projTaskApproverLabel"),
            nextActionLabel: t(locale, "projTaskNextActionLabel"),
            bottleneckLabel: t(locale, "projTaskBottleneckLabel"),
            statusOptions: TASK_STATUS_OPTIONS.map((value) => ({
              value,
              label: tWorkflowNodeStatus(locale, value),
            })),
            labelOptions: TASK_LABEL_OPTIONS.map((value) => ({ value, label: formatWorkflowNodeLabel(value) })),
            labelGroupWaiting: t(locale, "projTaskLabelGroupWaiting"),
            labelGroupApproval: t(locale, "projTaskLabelGroupApproval"),
            labelGroupRisk: t(locale, "projTaskLabelGroupRisk"),
            mentionPlaceholder: t(locale, "projTaskMentionPlaceholder"),
            externalPlaceholder: t(locale, "projTaskExternalPlaceholder"),
            waitingDetailsPlaceholder: t(locale, "projTaskWaitingDetailsPlaceholder"),
            nextActionPlaceholder: t(locale, "projTaskNextActionPlaceholder"),
            summaryWaiting: t(locale, "projTaskSummaryWaiting"),
            summaryApproval: t(locale, "projTaskSummaryApproval"),
            summaryRisk: t(locale, "projTaskSummaryRisk"),
            summaryBottleneck: t(locale, "projTaskSummaryBottleneck"),
          }}
        />
      </ProjectProgressProvider>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <details
          id="section-relations"
          className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm"
        >
          <summary className="cursor-pointer select-none px-3 py-3 text-sm font-medium">
            {t(locale, "projJumpRelations")}{" "}
            <span className="text-sm font-normal text-[hsl(var(--muted))]">({relationCount})</span>
          </summary>
          <div className="max-h-[min(70vh,520px)] space-y-3 overflow-y-auto border-t border-[hsl(var(--border))] p-3 text-sm">
            {canManage ? (
              <form action={addProjectRelationAction} className="grid gap-2 border-b pb-3 md:grid-cols-3">
                <input type="hidden" name="fromProjectId" value={project.id} />
                <div className="space-y-1">
                  <label className="text-sm font-medium">{t(locale, "projRelationType")}</label>
                  <Select name="relationType" defaultValue="LINKED" required>
                    {RELATION_TYPES.map((relType) => (
                      <option key={relType} value={relType}>
                        {tProjectRelationType(locale, relType)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">{t(locale, "projTargetProject")}</label>
                  <Select name="toProjectId" required>
                    <option value="">{t(locale, "commonSelectProject")}</option>
                    {relationTargetProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.company.name} / {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">{t(locale, "projNote")}</label>
                  <Input name="note" placeholder={t(locale, "projOptionalRelationNote")} />
                </div>
                <div className="md:col-span-3">
                  <FormSubmitButton type="submit" variant="secondary">
                    {t(locale, "projAddRelation")}
                  </FormSubmitButton>
                </div>
              </form>
            ) : null}
            <ul className="space-y-3 text-sm">
              {project.outgoingRelations.map((rel) => {
                const sharedKIds = new Set(rel.sharedKnowledge.map((s) => s.knowledgeAsset.id));
                const sharedAIds = new Set(rel.sharedAttachments.map((s) => s.attachment.id));
                const canRelManage = canManageProject(user, project) || canManageProject(user, rel.toProject);
                return (
                  <li key={rel.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
                    <div className="text-base font-medium">{tProjectRelationType(locale, rel.relationType)}</div>
                    <div className="text-sm text-[hsl(var(--muted))]">
                      {t(locale, "projThisTo")}{" "}
                      <Link className="font-medium text-[hsl(var(--foreground))] underline-offset-2 hover:underline" href={`/projects/${rel.toProject.id}`}>
                        {rel.toProject.company.name} / {rel.toProject.name}
                      </Link>
                    </div>
                    {rel.note ? <p className="mt-1 text-sm text-[hsl(var(--muted))]">{rel.note}</p> : null}
                    {canRelManage ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <details>
                          <summary className="cursor-pointer text-sm text-[hsl(var(--muted))] underline underline-offset-2">
                            {t(locale, "projEditNote")}
                          </summary>
                          <form action={updateProjectRelationNoteAction} className="mt-2 flex flex-wrap items-end gap-2">
                            <input type="hidden" name="relationId" value={rel.id} />
                            <Input
                              name="note"
                              defaultValue={rel.note ?? ""}
                              placeholder={t(locale, "projEditNote")}
                              className="h-9 min-w-[220px] text-sm"
                            />
                            <FormSubmitButton type="submit" variant="secondary" className="h-9 px-2 text-sm">
                              {t(locale, "projSaveNote")}
                            </FormSubmitButton>
                          </form>
                        </details>
                        <form action={removeProjectRelationAction}>
                          <input type="hidden" name="relationId" value={rel.id} />
                          <FormSubmitButton type="submit" variant="secondary" className="h-9 px-2 text-sm">
                            {t(locale, "btnRemove")}
                          </FormSubmitButton>
                        </form>
                      </div>
                    ) : null}
                    {canRelManage && (ownKnowledge.length > 0 || projectFiles.length > 0) ? (
                      <div className="mt-3 border-t border-[hsl(var(--border))] pt-2">
                        <p className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">
                          {t(locale, "projShareWithPeer")}
                        </p>
                        <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-sm">
                          {ownKnowledge.map((ka) => (
                            <li key={ka.id} className="flex items-center justify-between gap-2">
                              <span className="min-w-0 truncate">{ka.title}</span>
                              <form action={toggleProjectRelationShareKnowledgeAction} className="shrink-0">
                                <input type="hidden" name="relationId" value={rel.id} />
                                <input type="hidden" name="knowledgeAssetId" value={ka.id} />
                                <FormSubmitButton type="submit" variant="secondary" className="h-8 px-2 text-sm">
                                  {sharedKIds.has(ka.id) ? t(locale, "projShareStop") : t(locale, "projShareStart")}
                                </FormSubmitButton>
                              </form>
                            </li>
                          ))}
                          {projectFiles.map((f) => (
                            <li key={f.id} className="flex items-center justify-between gap-2">
                              <span className="min-w-0 truncate">{f.fileName}</span>
                              <form action={toggleProjectRelationShareAttachmentAction} className="shrink-0">
                                <input type="hidden" name="relationId" value={rel.id} />
                                <input type="hidden" name="attachmentId" value={f.id} />
                                <FormSubmitButton type="submit" variant="secondary" className="h-8 px-2 text-sm">
                                  {sharedAIds.has(f.id) ? t(locale, "projShareStop") : t(locale, "projShareStart")}
                                </FormSubmitButton>
                              </form>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                );
              })}
              {project.incomingRelations.map((rel) => {
                const sharedKIds = new Set(rel.sharedKnowledge.map((s) => s.knowledgeAsset.id));
                const sharedAIds = new Set(rel.sharedAttachments.map((s) => s.attachment.id));
                const canRelManage = canManageProject(user, rel.fromProject) || canManageProject(user, project);
                return (
                  <li key={rel.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
                    <div className="text-base font-medium">{tProjectRelationType(locale, rel.relationType)}</div>
                    <div className="text-sm text-[hsl(var(--muted))]">
                      {t(locale, "projDependsFromLine")}{" "}
                      <Link className="font-medium text-[hsl(var(--foreground))] underline-offset-2 hover:underline" href={`/projects/${rel.fromProject.id}`}>
                        {rel.fromProject.company.name} / {rel.fromProject.name}
                      </Link>{" "}
                      → {t(locale, "projThisProject")}
                    </div>
                    {rel.note ? <p className="mt-1 text-sm text-[hsl(var(--muted))]">{rel.note}</p> : null}
                    {canRelManage ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <details>
                          <summary className="cursor-pointer text-sm text-[hsl(var(--muted))] underline underline-offset-2">
                            {t(locale, "projEditNote")}
                          </summary>
                          <form action={updateProjectRelationNoteAction} className="mt-2 flex flex-wrap items-end gap-2">
                            <input type="hidden" name="relationId" value={rel.id} />
                            <Input
                              name="note"
                              defaultValue={rel.note ?? ""}
                              placeholder={t(locale, "projEditNote")}
                              className="h-9 min-w-[220px] text-sm"
                            />
                            <FormSubmitButton type="submit" variant="secondary" className="h-9 px-2 text-sm">
                              {t(locale, "projSaveNote")}
                            </FormSubmitButton>
                          </form>
                        </details>
                        <form action={removeProjectRelationAction}>
                          <input type="hidden" name="relationId" value={rel.id} />
                          <FormSubmitButton type="submit" variant="secondary" className="h-9 px-2 text-sm">
                            {t(locale, "btnRemove")}
                          </FormSubmitButton>
                        </form>
                      </div>
                    ) : null}
                    {canRelManage && (ownKnowledge.length > 0 || projectFiles.length > 0) ? (
                      <div className="mt-3 border-t border-[hsl(var(--border))] pt-2">
                        <p className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">
                          {t(locale, "projShareWithPeer")}
                        </p>
                        <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-sm">
                          {ownKnowledge.map((ka) => (
                            <li key={ka.id} className="flex items-center justify-between gap-2">
                              <span className="min-w-0 truncate">{ka.title}</span>
                              <form action={toggleProjectRelationShareKnowledgeAction} className="shrink-0">
                                <input type="hidden" name="relationId" value={rel.id} />
                                <input type="hidden" name="knowledgeAssetId" value={ka.id} />
                                <FormSubmitButton type="submit" variant="secondary" className="h-8 px-2 text-sm">
                                  {sharedKIds.has(ka.id) ? t(locale, "projShareStop") : t(locale, "projShareStart")}
                                </FormSubmitButton>
                              </form>
                            </li>
                          ))}
                          {projectFiles.map((f) => (
                            <li key={f.id} className="flex items-center justify-between gap-2">
                              <span className="min-w-0 truncate">{f.fileName}</span>
                              <form action={toggleProjectRelationShareAttachmentAction} className="shrink-0">
                                <input type="hidden" name="relationId" value={rel.id} />
                                <input type="hidden" name="attachmentId" value={f.id} />
                                <FormSubmitButton type="submit" variant="secondary" className="h-8 px-2 text-sm">
                                  {sharedAIds.has(f.id) ? t(locale, "projShareStop") : t(locale, "projShareStart")}
                                </FormSubmitButton>
                              </form>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                );
              })}
              {!project.outgoingRelations.length && !project.incomingRelations.length ? (
                <li className="text-sm text-[hsl(var(--muted))]">{t(locale, "projNoRelations")}</li>
              ) : null}
            </ul>
          </div>
        </details>

        <details
          id="section-knowledge"
          className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm"
        >
          <summary className="cursor-pointer select-none px-3 py-3 text-sm font-medium">
            {t(locale, "projJumpKnowledge")}{" "}
            <span className="text-sm font-normal text-[hsl(var(--muted))]">({knowledgeTotalCount})</span>
          </summary>
          <div className="max-h-[min(70vh,520px)] space-y-3 overflow-y-auto border-t border-[hsl(var(--border))] p-3 text-sm">
            {canReadKnowledge ? (
              <div className="flex flex-wrap items-center gap-2 border-b border-[hsl(var(--border))] pb-2 text-sm">
                <Link className="font-medium text-[hsl(var(--accent))] underline-offset-2 hover:underline" href={`/knowledge/browse?projectId=${project.id}`}>
                  {t(locale, "projKnowledgeBrowseThisProject")}
                </Link>
              </div>
            ) : null}

            {canEditKnowledge ? (
              <details className="rounded-md border border-[hsl(var(--border))] bg-black/[0.02] p-2 dark:bg-white/[0.02]">
                <summary className="cursor-pointer text-sm font-medium">{t(locale, "projKnowledgeAddOnProject")}</summary>
                <form action={createKnowledgeAssetAction} className="mt-2 grid gap-2">
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="companyId" value={project.companyId} />
                  <div className="space-y-1">
                    <label className="text-sm font-medium uppercase tracking-wide text-[hsl(var(--muted))]">{t(locale, "commonTitle")}</label>
                    <Input name="title" required className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium uppercase tracking-wide text-[hsl(var(--muted))]">{t(locale, "commonLayer")}</label>
                    <select name="layer" className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-sm" defaultValue="TEMPLATE_PLAYBOOK">
                      {KNOWLEDGE_LAYERS.map((layer) => (
                        <option key={layer} value={layer}>
                          {tKnowledgeLayer(locale, layer)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium uppercase tracking-wide text-[hsl(var(--muted))]">{t(locale, "commonSummary")}</label>
                    <Input name="summary" className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium uppercase tracking-wide text-[hsl(var(--muted))]">{t(locale, "commonContent")}</label>
                    <textarea
                      name="content"
                      rows={3}
                      className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-sm"
                      placeholder={t(locale, "kbContentOrUrlHint")}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium uppercase tracking-wide text-[hsl(var(--muted))]">{t(locale, "commonSourceUrl")}</label>
                    <Input name="sourceUrl" type="url" className="text-sm" placeholder="https://..." />
                  </div>
                  <FormSubmitButton type="submit" variant="secondary" className="h-9 text-sm">
                    {t(locale, "btnSave")}
                  </FormSubmitButton>
                </form>
              </details>
            ) : null}

            {knowledgeTotalCount ? (
              <ul className="space-y-2">
                {sharedKnowledgeInbound.map((row) => {
                  const a = row.knowledgeAsset;
                  const openHref = (a.sourceUrl ?? "").trim() || null;
                  return (
                    <li key={row.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
                      <p className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">
                        {t(locale, "projKnowledgeSharedFrom")}{" "}
                        <Link className="text-[hsl(var(--foreground))] underline-offset-2 hover:underline" href={`/projects/${row.relation.fromProject.id}`}>
                          {row.relation.fromProject.company.name} / {row.relation.fromProject.name}
                        </Link>
                      </p>
                      <div className="text-base font-semibold leading-snug">{a.title}</div>
                      <div className="text-sm text-[hsl(var(--muted))]">
                        {tKnowledgeLayer(locale, a.layer)} · {t(locale, "kbByAuthor")} {a.author.name}
                      </div>
                      {a.summary ? <p className="mt-1 line-clamp-2 text-sm text-[hsl(var(--muted))]">{a.summary}</p> : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <OpenDialogButton
                          dialogId={`proj-kb-in-${row.id}`}
                          className="inline-flex h-8 items-center rounded-md border border-[hsl(var(--border))] px-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          {t(locale, "projKnowledgeViewDetails")}
                        </OpenDialogButton>
                        {openHref ? (
                          <a
                            href={openHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-8 items-center rounded-md border border-[hsl(var(--border))] px-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
                          >
                            {t(locale, "kbOpenResource")}
                          </a>
                        ) : null}
                      </div>
                      <dialog
                        id={`proj-kb-in-${row.id}`}
                        className="app-modal-dialog z-50 max-h-[min(90vh,520px)] w-[min(100vw-2rem,440px)] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0 shadow-2xl backdrop:bg-black/40"
                      >
                        <div className="flex items-start justify-between gap-2 border-b border-[hsl(var(--border))] px-3 py-2">
                          <h3 className="text-sm font-semibold">{a.title}</h3>
                          <CloseDialogButton
                            dialogId={`proj-kb-in-${row.id}`}
                            className="rounded-lg px-2 py-1 text-xs text-[hsl(var(--muted))] hover:bg-black/5 dark:hover:bg-white/10"
                            label={t(locale, "kbDialogClose")}
                          />
                        </div>
                        <div className="max-h-[calc(90vh-80px)] space-y-2 overflow-y-auto p-3 text-xs">
                          {a.summary ? <p className="text-[hsl(var(--muted))]">{a.summary}</p> : null}
                          <p className="whitespace-pre-wrap text-[hsl(var(--foreground))]">{a.content}</p>
                          {openHref ? (
                            <a href={openHref} target="_blank" rel="noopener noreferrer" className="inline-block font-medium text-[hsl(var(--accent))] underline">
                              {openHref}
                            </a>
                          ) : null}
                        </div>
                      </dialog>
                    </li>
                  );
                })}
                {ownKnowledge.map((asset) => {
                  const canMutateKb = user.isSuperAdmin || user.id === asset.authorId;
                  const openHref = (asset.sourceUrl ?? "").trim() || null;
                  return (
                    <li key={asset.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
                      <div className="text-base font-semibold leading-snug">{asset.title}</div>
                      <div className="text-sm text-[hsl(var(--muted))]">
                        {tKnowledgeLayer(locale, asset.layer)} · {t(locale, "kbByAuthor")} {asset.author.name}
                      </div>
                      {asset.summary ? <p className="mt-1 line-clamp-2 text-sm text-[hsl(var(--muted))]">{asset.summary}</p> : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <OpenDialogButton
                          dialogId={`proj-kb-view-${asset.id}`}
                          className="inline-flex h-8 items-center rounded-md border border-[hsl(var(--border))] px-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          {t(locale, "projKnowledgeViewDetails")}
                        </OpenDialogButton>
                        {openHref ? (
                          <a
                            href={openHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-8 items-center rounded-md border border-[hsl(var(--border))] px-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
                          >
                            {t(locale, "kbOpenResource")}
                          </a>
                        ) : null}
                        {canReadKnowledge ? (
                          <Link
                            href={`/knowledge/browse?projectId=${project.id}`}
                            className="inline-flex h-8 items-center rounded-md border border-[hsl(var(--border))] px-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
                          >
                            {t(locale, "projKnowledgeBrowseThisProject")}
                          </Link>
                        ) : null}
                        {canEditKnowledge && canMutateKb ? (
                          <>
                            <OpenDialogButton
                              dialogId={`proj-kb-edit-${asset.id}`}
                              className="inline-flex h-8 items-center rounded-md border border-[hsl(var(--border))] px-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
                            >
                              {t(locale, "kbEditKnowledge")}
                            </OpenDialogButton>
                            <form action={softDeleteKnowledgeAssetAction}>
                              <input type="hidden" name="id" value={asset.id} />
                              <FormSubmitButton type="submit" variant="secondary" className="h-7 px-2 text-xs">
                                {t(locale, "btnArchive")}
                              </FormSubmitButton>
                            </form>
                          </>
                        ) : null}
                      </div>
                      <dialog
                        id={`proj-kb-view-${asset.id}`}
                        className="app-modal-dialog z-50 max-h-[min(90vh,520px)] w-[min(100vw-2rem,440px)] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0 shadow-2xl backdrop:bg-black/40"
                      >
                        <div className="flex items-start justify-between gap-2 border-b border-[hsl(var(--border))] px-3 py-2">
                          <h3 className="text-sm font-semibold">{asset.title}</h3>
                          <CloseDialogButton
                            dialogId={`proj-kb-view-${asset.id}`}
                            className="rounded-lg px-2 py-1 text-xs text-[hsl(var(--muted))] hover:bg-black/5 dark:hover:bg-white/10"
                            label={t(locale, "kbDialogClose")}
                          />
                        </div>
                        <div className="max-h-[calc(90vh-80px)] space-y-2 overflow-y-auto p-3 text-xs">
                          {asset.summary ? <p className="text-[hsl(var(--muted))]">{asset.summary}</p> : null}
                          <p className="whitespace-pre-wrap text-[hsl(var(--foreground))]">{asset.content}</p>
                          {openHref ? (
                            <a href={openHref} target="_blank" rel="noopener noreferrer" className="inline-block font-medium text-[hsl(var(--accent))] underline">
                              {openHref}
                            </a>
                          ) : null}
                        </div>
                      </dialog>
                      {canEditKnowledge && canMutateKb ? (
                        <dialog
                          id={`proj-kb-edit-${asset.id}`}
                          className="app-modal-dialog z-50 max-h-[min(90vh,560px)] w-[min(100vw-2rem,480px)] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0 shadow-2xl backdrop:bg-black/40"
                        >
                          <div className="flex items-start justify-between gap-2 border-b border-[hsl(var(--border))] px-3 py-2">
                            <div>
                              <h3 className="text-sm font-semibold">{t(locale, "kbEditKnowledge")}</h3>
                              <p className="text-xs text-[hsl(var(--muted))]">{asset.title}</p>
                            </div>
                            <CloseDialogButton
                              dialogId={`proj-kb-edit-${asset.id}`}
                              className="rounded-lg px-2 py-1 text-xs text-[hsl(var(--muted))] hover:bg-black/5 dark:hover:bg-white/10"
                              label={t(locale, "kbDialogClose")}
                            />
                          </div>
                          <form action={updateKnowledgeAssetAction} className="max-h-[calc(90vh-100px)] space-y-2 overflow-y-auto p-3 text-xs">
                            <input type="hidden" name="id" value={asset.id} />
                            <input type="hidden" name="titleEn" value={asset.titleEn ?? ""} />
                            <input type="hidden" name="titleZh" value={asset.titleZh ?? ""} />
                            <textarea name="content" defaultValue={asset.content} className="sr-only" readOnly rows={1} tabIndex={-1} aria-hidden />
                            <div className="space-y-1">
                              <label className="text-xs font-medium uppercase text-[hsl(var(--muted))]">{t(locale, "kbEditTitle")}</label>
                              <Input name="title" defaultValue={asset.title} required className="text-xs" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium uppercase text-[hsl(var(--muted))]">{t(locale, "kbEditSummary")}</label>
                              <Input name="summary" defaultValue={asset.summary ?? ""} className="text-xs" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium uppercase text-[hsl(var(--muted))]">{t(locale, "commonLayer")}</label>
                              <select
                                name="layer"
                                defaultValue={asset.layer}
                                className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-xs"
                              >
                                {KNOWLEDGE_LAYERS.map((layer) => (
                                  <option key={layer} value={layer}>
                                    {tKnowledgeLayer(locale, layer)}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium uppercase text-[hsl(var(--muted))]">{t(locale, "commonSourceUrl")}</label>
                              <Input name="sourceUrl" type="url" defaultValue={asset.sourceUrl ?? ""} className="text-xs" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium uppercase text-[hsl(var(--muted))]">{t(locale, "kbTagsField")}</label>
                              <Input name="tags" defaultValue={asset.tags ?? ""} className="text-xs" placeholder={t(locale, "kbTagsPlaceholder")} />
                            </div>
                            <input type="hidden" name="projectId" value={project.id} />
                            <input type="hidden" name="companyId" value={project.companyId} />
                            <div className="flex flex-wrap gap-2 pt-1">
                              <FormSubmitButton type="submit" variant="secondary" className="h-8 text-xs">
                                {t(locale, "kbSaveChanges")}
                              </FormSubmitButton>
                              <CloseDialogButton
                                dialogId={`proj-kb-edit-${asset.id}`}
                                className="rounded-md border border-[hsl(var(--border))] px-3 py-2 text-xs hover:bg-black/5 dark:hover:bg-white/10"
                                label={t(locale, "kbDialogClose")}
                              />
                            </div>
                          </form>
                        </dialog>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-[hsl(var(--muted))]">
                {t(locale, "projKnowledgeEmpty")}{" "}
                {canReadKnowledge ? (
                  <Link className="underline" href={`/knowledge/browse?projectId=${project.id}`}>
                    {t(locale, "projKnowledgeOpenLink")}
                  </Link>
                ) : null}
              </p>
            )}
          </div>
        </details>

        <details
          id="section-files"
          className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm"
        >
          <summary className="cursor-pointer select-none px-3 py-3 text-sm font-medium">
            {t(locale, "projJumpFiles")}{" "}
            <span className="text-sm font-normal text-[hsl(var(--muted))]">({filesTotalCount})</span>
          </summary>
          <div className="max-h-[min(70vh,520px)] space-y-3 overflow-y-auto border-t border-[hsl(var(--border))] p-3 text-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">{t(locale, "projFilesNameUrlHeading")}</p>

            {sharedAttachmentInbound.map((row) => {
              const f = row.attachment;
              const href =
                f.resourceKind === "EXTERNAL_URL" && f.externalUrl?.trim()
                  ? f.externalUrl.trim()
                  : `/api/attachments/${f.id}`;
              const isExternal = f.resourceKind === "EXTERNAL_URL" && !!f.externalUrl?.trim();
              return (
                <div key={row.id} className="rounded-md border border-dashed border-[hsl(var(--border))] px-3 py-2 text-sm">
                  <p className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">
                    {t(locale, "projFilesSharedFrom")}{" "}
                    <Link className="text-[hsl(var(--foreground))] underline-offset-2 hover:underline" href={`/projects/${row.relation.fromProject.id}`}>
                      {row.relation.fromProject.company.name} / {row.relation.fromProject.name}
                    </Link>
                  </p>
                  <div className="mt-1 grid gap-1 sm:grid-cols-[1fr_auto] sm:items-start">
                    <div className="min-w-0">
                      <a
                        href={href}
                        {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        className="font-medium text-[hsl(var(--accent))] underline-offset-2 hover:underline"
                      >
                        {f.fileName}
                      </a>
                    </div>
                    <div className="min-w-0 break-all text-[hsl(var(--muted))]">
                      <a
                        href={href}
                        {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        className="underline-offset-2 hover:underline"
                      >
                        {isExternal ? f.externalUrl : href}
                      </a>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <OpenDialogButton
                      dialogId={`proj-file-in-${row.id}`}
                      className="inline-flex h-8 items-center rounded-md border border-[hsl(var(--border))] px-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      {t(locale, "projFilesViewDetails")}
                    </OpenDialogButton>
                  </div>
                  <dialog
                    id={`proj-file-in-${row.id}`}
                    className="app-modal-dialog z-50 max-h-[min(90vh,440px)] w-[min(100vw-2rem,420px)] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0 shadow-2xl backdrop:bg-black/40"
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-[hsl(var(--border))] px-3 py-2">
                      <h3 className="text-sm font-semibold">{f.fileName}</h3>
                      <CloseDialogButton
                        dialogId={`proj-file-in-${row.id}`}
                        className="rounded-lg px-2 py-1 text-xs text-[hsl(var(--muted))] hover:bg-black/5 dark:hover:bg-white/10"
                        label={t(locale, "kbDialogClose")}
                      />
                    </div>
                    <div className="space-y-2 p-3 text-xs">
                      <p className="break-all text-[hsl(var(--muted))]">{isExternal ? f.externalUrl : href}</p>
                      {f.description ? <p className="whitespace-pre-wrap text-[hsl(var(--foreground))]">{f.description}</p> : null}
                      <a
                        href={href}
                        {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        className="inline-flex h-8 items-center rounded-md border border-[hsl(var(--border))] px-3 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        {t(locale, "kbOpenResource")}
                      </a>
                    </div>
                  </dialog>
                </div>
              );
            })}

            {projectFiles.length ? (
              <ul className="space-y-2">
                {projectFiles.map((f) => {
                  const isExternal = f.resourceKind === "EXTERNAL_URL" && !!f.externalUrl?.trim();
                  const href = isExternal ? f.externalUrl!.trim() : `/api/attachments/${f.id}`;
                  return (
                    <li key={f.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm">
                      <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-start">
                        <div className="min-w-0">
                          <a
                            href={href}
                            {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                            className="font-medium text-[hsl(var(--accent))] underline-offset-2 hover:underline"
                          >
                            {f.fileName}
                          </a>
                          <p className="mt-0.5 text-sm text-[hsl(var(--muted))]">{f.createdAt.toISOString().slice(0, 10)}</p>
                        </div>
                        <div className="min-w-0 break-all text-sm text-[hsl(var(--muted))]">
                          <a
                            href={href}
                            {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                            className="underline-offset-2 hover:underline"
                          >
                            {isExternal ? f.externalUrl : href}
                          </a>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <OpenDialogButton
                          dialogId={`proj-file-view-${f.id}`}
                          className="inline-flex h-8 items-center rounded-md border border-[hsl(var(--border))] px-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          {t(locale, "projFilesViewDetails")}
                        </OpenDialogButton>
                        {canManage && isExternal ? (
                          <OpenDialogButton
                            dialogId={`proj-file-edit-${f.id}`}
                            className="inline-flex h-8 items-center rounded-md border border-[hsl(var(--border))] px-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
                          >
                            {t(locale, "projFilesEditLink")}
                          </OpenDialogButton>
                        ) : null}
                        {canManage ? (
                          <form action={softDeleteAttachmentAction} className="inline">
                            <input type="hidden" name="id" value={f.id} />
                            <FormSubmitButton type="submit" variant="secondary" className="h-8 px-2 text-sm">
                              {t(locale, "attMoveTrash")}
                            </FormSubmitButton>
                          </form>
                        ) : null}
                      </div>
                      <dialog
                        id={`proj-file-view-${f.id}`}
                        className="app-modal-dialog z-50 max-h-[min(90vh,440px)] w-[min(100vw-2rem,420px)] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0 shadow-2xl backdrop:bg-black/40"
                      >
                        <div className="flex items-start justify-between gap-2 border-b border-[hsl(var(--border))] px-3 py-2">
                          <h3 className="text-sm font-semibold">{f.fileName}</h3>
                          <CloseDialogButton
                            dialogId={`proj-file-view-${f.id}`}
                            className="rounded-lg px-2 py-1 text-xs text-[hsl(var(--muted))] hover:bg-black/5 dark:hover:bg-white/10"
                            label={t(locale, "kbDialogClose")}
                          />
                        </div>
                        <div className="space-y-2 p-3 text-xs">
                          <p className="break-all text-[hsl(var(--muted))]">{isExternal ? f.externalUrl : href}</p>
                          {f.description ? <p className="whitespace-pre-wrap text-[hsl(var(--foreground))]">{f.description}</p> : null}
                          <a
                            href={href}
                            {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                            className="inline-flex h-8 items-center rounded-md border border-[hsl(var(--border))] px-3 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10"
                          >
                            {t(locale, "kbOpenResource")}
                          </a>
                        </div>
                      </dialog>
                      {canManage && isExternal ? (
                        <dialog
                          id={`proj-file-edit-${f.id}`}
                          className="app-modal-dialog z-50 max-h-[min(90vh,480px)] w-[min(100vw-2rem,440px)] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0 shadow-2xl backdrop:bg-black/40"
                        >
                          <div className="flex items-start justify-between gap-2 border-b border-[hsl(var(--border))] px-3 py-2">
                            <h3 className="text-sm font-semibold">{t(locale, "projFilesEditLink")}</h3>
                            <CloseDialogButton
                              dialogId={`proj-file-edit-${f.id}`}
                              className="rounded-lg px-2 py-1 text-xs text-[hsl(var(--muted))] hover:bg-black/5 dark:hover:bg-white/10"
                              label={t(locale, "kbDialogClose")}
                            />
                          </div>
                          <form action={updateProjectExternalLinkAction} className="space-y-2 p-3 text-xs">
                            <input type="hidden" name="id" value={f.id} />
                            <div className="space-y-1">
                              <label className="text-xs font-medium uppercase text-[hsl(var(--muted))]">{t(locale, "resLinkLabel")}</label>
                              <Input name="fileName" defaultValue={f.fileName} required className="text-xs" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium uppercase text-[hsl(var(--muted))]">{t(locale, "resExternalUrl")}</label>
                              <Input name="externalUrl" type="url" defaultValue={f.externalUrl ?? ""} required className="text-xs" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium uppercase text-[hsl(var(--muted))]">{t(locale, "commonDescription")}</label>
                              <Input name="description" defaultValue={f.description ?? ""} className="text-xs" />
                            </div>
                            <div className="flex flex-wrap gap-2 pt-1">
                              <FormSubmitButton type="submit" variant="secondary" className="h-8 text-xs">
                                {t(locale, "kbSaveChanges")}
                              </FormSubmitButton>
                              <CloseDialogButton
                                dialogId={`proj-file-edit-${f.id}`}
                                className="rounded-md border border-[hsl(var(--border))] px-3 py-2 text-xs hover:bg-black/5 dark:hover:bg-white/10"
                                label={t(locale, "kbDialogClose")}
                              />
                            </div>
                          </form>
                        </dialog>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : sharedAttachmentInbound.length ? null : (
              <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "wfNoFiles")}</p>
            )}

            {projectFiles.length ? (
              <details className="rounded-md border border-[hsl(var(--border))] bg-black/[0.02] p-2 text-sm dark:bg-white/[0.02]">
                <summary className="cursor-pointer font-medium">{t(locale, "projFilesVersionHistory")}</summary>
                <div className="mt-2">
                  <AttachmentVersionTree
                    attachments={projectFiles.map((file) => ({
                      id: file.id,
                      previousVersionId: file.previousVersionId,
                      fileName: file.fileName,
                      createdAt: file.createdAt,
                      description: file.description,
                      resourceKind: file.resourceKind,
                      externalUrl: file.externalUrl,
                    }))}
                    locale={locale}
                    showTrash={false}
                  />
                </div>
              </details>
            ) : null}

            {canManage ? (
              <form action={addExternalResourceLinkAction} className="grid gap-2 border-t border-[hsl(var(--border))] pt-3 md:grid-cols-2">
                <input type="hidden" name="projectId" value={project.id} />
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium">{t(locale, "resExternalUrl")}</label>
                  <Input name="externalUrl" type="url" required placeholder="https://drive.google.com/..." className="text-sm" />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium">{t(locale, "resLinkLabel")}</label>
                  <Input name="label" placeholder={t(locale, "resLinkLabelPh")} className="text-sm" />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium">{t(locale, "commonDescription")}</label>
                  <Input name="description" className="text-sm" />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium">{t(locale, "wfPrevVersion")}</label>
                  <select
                    name="previousVersionId"
                    className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-sm"
                    defaultValue=""
                  >
                    <option value="">{t(locale, "wfNewVersionNone")}</option>
                    {projectFiles.map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.fileName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <FormSubmitButton type="submit" variant="secondary" className="h-9 text-sm">
                    {t(locale, "resAddLink")}
                  </FormSubmitButton>
                </div>
              </form>
            ) : null}
          </div>
        </details>
      </div>

      {canManage ? (
        <details
          id="section-edit-project"
          className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm"
        >
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
            {t(locale, "projEditProject")} · {t(locale, "projDetailsSummary")}
          </summary>
          <div className="space-y-4 border-t border-[hsl(var(--border))] p-4">
            <form action={updateProjectAction} className="space-y-3">
              <input type="hidden" name="projectId" value={project.id} />
              <div className="space-y-1">
                <label className="text-sm font-medium">{t(locale, "commonName")}</label>
                <Input name="name" defaultValue={project.name} required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t(locale, "commonDescription")}</label>
                <textarea
                  name="description"
                  rows={3}
                  defaultValue={project.description ?? ""}
                  className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t(locale, "commonOwner")}</label>
                <Select name="ownerId" defaultValue={project.ownerId}>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium">{t(locale, "projFieldDepartment")}</label>
                  <Select name="departmentId" defaultValue={project.departmentId ?? ""}>
                    <option value="">{t(locale, "projDeptGroupNone")}</option>
                    {projectDepts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium">{t(locale, "projFieldProjectGroup")}</label>
                  <Select name="projectGroupId" defaultValue={project.projectGroupId ?? ""}>
                    <option value="">{t(locale, "projDeptGroupNone")}</option>
                    {projectGroupList.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">{t(locale, "commonPriority")}</label>
                  <Select name="priority" defaultValue={project.priority}>
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {tPriority(locale, p)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">{t(locale, "commonStatus")}</label>
                  <Select name="status" defaultValue={project.status}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {tProjectStatus(locale, s)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t(locale, "projProjectDeadlineLabel")}</label>
                <Input name="deadline" type="datetime-local" defaultValue={toDatetimeLocalValue(project.deadline)} />
              </div>
              <FormSubmitButton type="submit">{t(locale, "btnSave")}</FormSubmitButton>
            </form>
            <>
                <div className="flex gap-2 border-t pt-4">
                  {project.status !== "ARCHIVED" ? (
                    <form action={archiveProjectAction}>
                      <input type="hidden" name="projectId" value={project.id} />
                      <FormSubmitButton type="submit" variant="secondary">
                        {t(locale, "projArchive")}
                      </FormSubmitButton>
                    </form>
                  ) : (
                    <form action={restoreProjectAction}>
                      <input type="hidden" name="projectId" value={project.id} />
                      <FormSubmitButton type="submit" variant="secondary">
                        {t(locale, "projRestore")}
                      </FormSubmitButton>
                    </form>
                  )}
                </div>
                {canSoftDeleteProject ? (
                  <form action={softDeleteProjectAction} className="border-t pt-4">
                    <input type="hidden" name="projectId" value={project.id} />
                    <FormSubmitButton
                      type="submit"
                      variant="secondary"
                      className="border border-rose-600/30 bg-rose-600/5 text-rose-900 dark:text-rose-100"
                    >
                      {t(locale, "projMoveTrash")}
                    </FormSubmitButton>
                  </form>
                ) : null}
              </>
          </div>
        </details>
      ) : null}

      <details
        id="section-edit-members"
        className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm"
      >
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          {t(locale, "projMembersTitle")} · {t(locale, "projDetailsSummary")}
        </summary>
        <div className="space-y-2 border-t border-[hsl(var(--border))] p-4">
          {canMemberManage ? (
            <form action={assignMultipleToProjectAction} className="mb-3 space-y-2 border-b pb-3">
              <input type="hidden" name="projectId" value={project.id} />
              <div className="space-y-1">
                <label className="text-sm font-medium">{t(locale, "projAddStaffHelp")}</label>
                <select
                  name="memberIds"
                  multiple
                  size={6}
                  className="min-h-[120px] w-full max-w-md rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm"
                >
                  {staff
                    .filter((s) => !project.memberships.some((m) => m.userId === s.id))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t(locale, "projRoleInProject")}</label>
                <Select name="roleDefinitionId" required className="min-w-[220px]">
                  {projectRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.displayName}
                    </option>
                  ))}
                </Select>
              </div>
              <FormSubmitButton type="submit" variant="secondary">
                {t(locale, "projAddSelectedBtn")}
              </FormSubmitButton>
            </form>
          ) : null}
          <ul className="space-y-2 text-sm">
            {project.memberships.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[hsl(var(--border))] px-2 py-1"
              >
                <span className="flex items-center gap-2">
                  <UserFace name={m.user.name} avatarUrl={m.user.avatarUrl} size={24} />
                  <span>
                    {m.user.name} — {m.roleDefinition.displayName}
                    {m.user.active ? "" : ` · ${t(locale, "projInactive")}`}
                  </span>
                </span>
                {canMemberManage ? (
                  <form action={removeProjectMembershipAction}>
                    <input type="hidden" name="userId" value={m.userId} />
                    <input type="hidden" name="projectId" value={project.id} />
                    <FormSubmitButton type="submit" variant="secondary" className="h-7 px-2 text-xs">
                      {t(locale, "btnRemove")}
                    </FormSubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "projStaffMultiCompanyHint")}</p>
        </div>
      </details>

    </div>
  );
}
