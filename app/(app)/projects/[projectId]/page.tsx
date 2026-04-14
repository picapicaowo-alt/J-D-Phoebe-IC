import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Priority,
  ProjectRelationType,
  ProjectStatus,
  RecognitionMode,
  WorkflowEdgeKind,
  WorkflowNodeStatus,
  WorkflowNodeType,
} from "@prisma/client";
import { assignMultipleToProjectAction, removeProjectMembershipAction } from "@/app/actions/staff";
import { createFeedbackEventAction } from "@/app/actions/feedback";
import { createRecognitionAction } from "@/app/actions/recognition";
import {
  createProjectMapEdgeAction,
  createProjectMapNodeAction,
  removeProjectMapEdgeAction,
  softDeleteProjectMapNodeAction,
  updateProjectMapNodeAction,
} from "@/app/actions/project-map";
import { softDeleteProjectAction } from "@/app/actions/trash";
import {
  addProjectRelationAction,
  archiveProjectAction,
  removeProjectRelationAction,
  restoreProjectAction,
  updateProjectRelationNoteAction,
  updateProjectAction,
} from "@/app/actions/project";
import { uploadProjectAttachmentAction } from "@/app/actions/attachments";
import { requireUser } from "@/lib/auth";
import { canEditProjectMap, canManageProject, canViewProject, type AccessUser } from "@/lib/access";
import { getLocale } from "@/lib/locale";
import {
  t,
  tKnowledgeLayer,
  tPriority,
  tProjectRelationType,
  tProjectStatus,
  tRecognitionMode,
  tRecognitionTagCategory,
  tWorkflowNodeStatus,
  tWorkflowNodeType,
} from "@/lib/messages";
import { displayRecognitionSecondary } from "@/lib/recognition-catalog";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { countdownPhrase, isOverdue } from "@/lib/deadlines";
import { RecognitionSecondarySelect } from "@/components/recognition-secondary-select";
import { FeedbackSecondarySelect } from "@/components/feedback-secondary-select";
import { AttachmentVersionTree } from "@/components/attachment-version-tree";

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

export default async function ProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = (await requireUser()) as AccessUser;
  const { projectId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: {
      company: true,
      owner: true,
      memberships: { include: { user: true, roleDefinition: true } },
      nodes: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
      },
      edges: {
        where: { deletedAt: null },
      },
      recognitions: {
        include: { toUser: true, fromUser: true },
        orderBy: { createdAt: "desc" },
        take: 6,
      },
      knowledgeAssets: {
        where: { deletedAt: null },
        include: { author: true },
        orderBy: { updatedAt: "desc" },
        take: 8,
      },
      layers: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
      },
      outgoingRelations: {
        include: { toProject: { include: { company: true } } },
      },
      incomingRelations: {
        include: { fromProject: { include: { company: true } } },
      },
    },
  });
  if (!project) notFound();
  if (!canViewProject(user, project)) notFound();

  const projectFiles = await prisma.attachment.findMany({
    where: {
      projectId: project.id,
      deletedAt: null,
      workflowNodeId: null,
      knowledgeAssetId: null,
      memberOutputId: null,
    },
    orderBy: { createdAt: "desc" },
  });

  const canManage = canManageProject(user, project);
  const canRecognize = await userHasPermission(user, "recognition.create");
  const canSoftDeleteProject =
    (await userHasPermission(user, "project.soft_delete")) &&
    (user.isSuperAdmin ||
      user.groupMemberships.some((m) => m.orgGroupId === project.company.orgGroupId && m.roleDefinition.key === "GROUP_ADMIN") ||
      user.companyMemberships.some((m) => m.companyId === project.companyId && m.roleDefinition.key === "COMPANY_ADMIN"));
  const staff = await prisma.user.findMany({
    where: { active: true, deletedAt: null },
    orderBy: { name: "asc" },
  });
  const projectRoles = await prisma.roleDefinition.findMany({
    where: { appliesScope: "PROJECT" },
    orderBy: { displayName: "asc" },
  });
  const relationTargetProjects = await prisma.project.findMany({
    where: { deletedAt: null, id: { not: project.id } },
    include: { company: true },
    orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
    take: 120,
  });

  const locale = await getLocale();
  const canEditMap = (await userHasPermission(user, "project.map.update")) && canEditProjectMap(user, project);
  const canMemberManage = (await userHasPermission(user, "project.member.manage")) && canManage;
  const canFeedback = (await userHasPermission(user, "feedback.submit")) && canManage;

  const NODE_STATUSES: WorkflowNodeStatus[] = [
    "NOT_STARTED",
    "IN_PROGRESS",
    "WAITING",
    "BLOCKED",
    "APPROVED",
    "DONE",
    "SKIPPED",
  ];
  const NODE_TYPES: WorkflowNodeType[] = ["MILESTONE", "TASK", "APPROVAL", "WAITING", "COMPLETED"];

  return (
    <div className="space-y-8">
      <div className="text-xs text-[hsl(var(--muted))]">
        <Link href="/projects">{t(locale, "projBreadcrumbProjects")}</Link> / {project.name}
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted))]">{t(locale, "projSummary")}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted))]">
          {project.company.name} · {tProjectStatus(locale, project.status)} · {tPriority(locale, project.priority)}
        </p>
        {project.deadline ? (
          <p className="mt-1 text-xs text-[hsl(var(--muted))]">
            {countdownPhrase(project.deadline)}
            {isOverdue(project.deadline) && project.status !== "COMPLETED" ? ` · ${t(locale, "projOverdue")}` : ""}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={`/projects/${project.id}/workflow`}>
          <Button type="button">{t(locale, "wfOpenAdvanced")}</Button>
        </Link>
      </div>

      <Card className="space-y-3 p-4">
        <CardTitle>{t(locale, "wfMapTitle")}</CardTitle>
        <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "wfMapCaption")}</p>
        <div className="space-y-2">
          {project.nodes.length ? (
            [...project.layers, { id: "__ungrouped__", name: "" }].map((layer) => {
              const laneNodes = project.nodes.filter((n) =>
                layer.id === "__ungrouped__" ? !n.layerId : n.layerId === layer.id,
              );
              if (!laneNodes.length) return null;
              return (
                <div key={layer.id} className="space-y-2 rounded-md border border-dashed border-[hsl(var(--border))] p-2">
                  <div className="text-xs font-medium text-[hsl(var(--muted))]">
                    {layer.id === "__ungrouped__" ? t(locale, "wfUngroupedLane") : layer.name}
                  </div>
                  {laneNodes.map((n, idx) => {
              const statusColor =
                n.status === "DONE"
                  ? "bg-emerald-500"
                  : n.status === "IN_PROGRESS"
                    ? "bg-sky-500"
                    : n.status === "BLOCKED"
                      ? "bg-rose-500"
                      : "bg-slate-400";
              const nodeIcon =
                n.nodeType === "MILESTONE"
                  ? "◆"
                  : n.nodeType === "APPROVAL"
                    ? "✔"
                    : n.nodeType === "WAITING"
                      ? "⏸"
                      : n.nodeType === "COMPLETED"
                        ? "●"
                        : "•";
              return (
                <div key={n.id} className="flex items-center gap-3 rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm">
                  <div className="relative flex h-8 w-8 items-center justify-center">
                    <span className={`inline-flex h-3 w-3 rounded-full ${statusColor}`} />
                    {idx < laneNodes.length - 1 ? (
                      <span className="absolute top-6 h-6 w-px bg-[hsl(var(--border))]" />
                    ) : null}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">
                      <span className="mr-1">{nodeIcon}</span>
                      {n.title}
                    </div>
                    <div className="text-xs text-[hsl(var(--muted))]">
                      {tWorkflowNodeType(locale, n.nodeType)} · {tWorkflowNodeStatus(locale, n.status)}
                    </div>
                  </div>
                  <div className="w-28">
                    <div className="h-2 w-full rounded bg-black/10 dark:bg-white/10">
                      <div
                        className="h-2 rounded bg-[hsl(var(--accent))]"
                        style={{ width: `${Math.max(0, Math.min(100, n.progressPercent))}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
                  })}
                </div>
              );
            })
          ) : (
            <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "wfNoNodes")}</p>
          )}
        </div>
        <div className="text-xs text-[hsl(var(--muted))]">
          {project.nodes.length} {t(locale, "wfNodesCount")} · {project.edges.length} {t(locale, "wfDeps")}
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <CardTitle>{t(locale, "wfProjectFiles")}</CardTitle>
        <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "wfProjectFilesCaption")}</p>
        {projectFiles.length ? (
          <AttachmentVersionTree
            attachments={projectFiles.map((f) => ({
              id: f.id,
              previousVersionId: f.previousVersionId,
              fileName: f.fileName,
              createdAt: f.createdAt,
              description: f.description,
            }))}
            locale={locale}
            showTrash={canManage}
          />
        ) : (
          <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "wfNoFiles")}</p>
        )}
        {canManage ? (
          <form
            action={uploadProjectAttachmentAction}
            encType="multipart/form-data"
            className="grid gap-2 border-t border-[hsl(var(--border))] pt-3 md:grid-cols-2"
          >
            <input type="hidden" name="projectId" value={project.id} />
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">{t(locale, "btnUpload")}</label>
              <Input type="file" name="file" required className="text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "commonTitleEn")}</label>
              <Input name="titleEn" className="text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "commonTitleZh")}</label>
              <Input name="titleZh" className="text-xs" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">{t(locale, "commonDescription")}</label>
              <Input name="description" className="text-xs" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">{t(locale, "commonLabels")}</label>
              <Input name="labels" className="text-xs" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">{t(locale, "wfPrevVersion")}</label>
              <select
                name="previousVersionId"
                className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-xs"
                defaultValue=""
              >
                <option value="">{t(locale, "wfNewVersionNone")}</option>
                {projectFiles.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.fileName}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <Button type="submit" variant="secondary" className="h-8 text-xs">
                {t(locale, "btnUpload")}
              </Button>
            </div>
          </form>
        ) : null}
      </Card>

      {canEditMap ? (
        <Card className="space-y-4 p-4">
          <CardTitle>{t(locale, "wfEditMapTitle")}</CardTitle>
          <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "wfEditMapCaption")}</p>
          <form action={createProjectMapNodeAction} className="grid gap-2 border-b pb-3 md:grid-cols-3">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">{t(locale, "wfNewNodeTitle")}</label>
              <Input name="title" required placeholder={t(locale, "wfNodePlaceholder")} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "projTypeLabel")}</label>
              <Select name="nodeType" defaultValue="TASK">
                {NODE_TYPES.map((nt) => (
                  <option key={nt} value={nt}>
                    {tWorkflowNodeType(locale, nt)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">{t(locale, "wfNodeDue")}</label>
              <Input name="dueAt" type="datetime-local" className="text-xs" />
              <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "wfNodeDueHelp")}</p>
            </div>
            <div className="space-y-1 md:col-span-3">
              <label className="text-xs font-medium">{t(locale, "projLayerLabel")}</label>
              <Select name="layerId">
                {project.layers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="md:col-span-3">
              <Button type="submit" variant="secondary">
                {t(locale, "wfAddNode")}
              </Button>
            </div>
          </form>
          <form action={createProjectMapEdgeAction} className="grid gap-2 border-b pb-3 md:grid-cols-3">
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="kind" value={WorkflowEdgeKind.DEPENDENCY} />
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "wfFromNode")}</label>
              <Select name="fromNodeId" required>
                <option value="">{t(locale, "wfSelect")}</option>
                {project.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "wfToNode")}</label>
              <Select name="toNodeId" required>
                <option value="">{t(locale, "wfSelect")}</option>
                {project.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" variant="secondary">
                {t(locale, "wfAddDependency")}
              </Button>
            </div>
          </form>
          <div className="space-y-2 text-sm">
            <p className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "wfNodesLabel")}</p>
            <ul className="space-y-2">
              {project.nodes.map((n) => (
                <li key={n.id} className="rounded-md border border-[hsl(var(--border))] p-2">
                  <form action={updateProjectMapNodeAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="nodeId" value={n.id} />
                    <Input name="title" defaultValue={n.title} className="min-w-[160px]" required />
                    <Select name="status" defaultValue={n.status} className="min-w-[140px]">
                      {NODE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {tWorkflowNodeStatus(locale, s)}
                        </option>
                      ))}
                    </Select>
                    <Select name="nodeType" defaultValue={n.nodeType} className="min-w-[120px]">
                      {NODE_TYPES.map((nt) => (
                        <option key={nt} value={nt}>
                          {tWorkflowNodeType(locale, nt)}
                        </option>
                      ))}
                    </Select>
                    <Input name="sortOrder" type="number" defaultValue={String(n.sortOrder)} className="w-20" />
                    <Input
                      name="dueAt"
                      type="datetime-local"
                      defaultValue={
                        n.dueAt
                          ? new Date(n.dueAt.getTime() - new Date().getTimezoneOffset() * 60000)
                              .toISOString()
                              .slice(0, 16)
                          : ""
                      }
                      className="w-[180px] text-xs"
                    />
                    <Button type="submit" variant="secondary" className="h-8 text-xs">
                      {t(locale, "btnSave")}
                    </Button>
                  </form>
                  <form action={softDeleteProjectMapNodeAction} className="mt-1">
                    <input type="hidden" name="nodeId" value={n.id} />
                    <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                      {t(locale, "wfRemoveNode")}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
          {project.edges.length ? (
            <ul className="space-y-1 text-xs">
              {project.edges.map((e) => {
                const from = project.nodes.find((x) => x.id === e.fromNodeId);
                const to = project.nodes.find((x) => x.id === e.toNodeId);
                return (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[hsl(var(--border))] px-2 py-1">
                    <span>
                      {from?.title ?? e.fromNodeId} → {to?.title ?? e.toNodeId} ({e.kind})
                    </span>
                    <form action={removeProjectMapEdgeAction}>
                      <input type="hidden" name="edgeId" value={e.id} />
                      <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                        Remove
                      </Button>
                    </form>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </Card>
      ) : null}

      <Card className="space-y-3 p-4">
        <CardTitle>{t(locale, "projRelationsTitle")}</CardTitle>
        {canManage ? (
          <form action={addProjectRelationAction} className="grid gap-2 border-b pb-3 md:grid-cols-3">
            <input type="hidden" name="fromProjectId" value={project.id} />
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "projRelationType")}</label>
              <Select name="relationType" defaultValue="LINKED" required>
                {RELATION_TYPES.map((relType) => (
                  <option key={relType} value={relType}>
                    {tProjectRelationType(locale, relType)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "projTargetProject")}</label>
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
              <label className="text-xs font-medium">{t(locale, "projNote")}</label>
              <Input name="note" placeholder={t(locale, "projOptionalRelationNote")} />
            </div>
            <div className="md:col-span-3">
              <Button type="submit" variant="secondary">
                {t(locale, "projAddRelation")}
              </Button>
            </div>
          </form>
        ) : null}
        <ul className="space-y-2 text-sm">
          {project.outgoingRelations.map((rel) => (
            <li key={rel.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
              <div className="font-medium">{tProjectRelationType(locale, rel.relationType)}</div>
              <div className="text-xs text-[hsl(var(--muted))]">
                {t(locale, "projThisTo")} {rel.toProject.company.name} / {rel.toProject.name}
              </div>
              {rel.note ? <p className="mt-1 text-xs text-[hsl(var(--muted))]">{rel.note}</p> : null}
              {canManage ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <details>
                    <summary className="cursor-pointer text-xs text-[hsl(var(--muted))] underline underline-offset-2">
                      {t(locale, "projEditNote")}
                    </summary>
                    <form action={updateProjectRelationNoteAction} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="relationId" value={rel.id} />
                      <Input
                        name="note"
                        defaultValue={rel.note ?? ""}
                        placeholder={t(locale, "projEditNote")}
                        className="h-7 min-w-[220px] text-xs"
                      />
                      <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                        {t(locale, "projSaveNote")}
                      </Button>
                    </form>
                  </details>
                  <form action={removeProjectRelationAction}>
                    <input type="hidden" name="relationId" value={rel.id} />
                    <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                      {t(locale, "btnRemove")}
                    </Button>
                  </form>
                </div>
              ) : null}
            </li>
          ))}
          {project.incomingRelations.map((rel) => (
            <li key={rel.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
              <div className="font-medium">{tProjectRelationType(locale, rel.relationType)}</div>
              <div className="text-xs text-[hsl(var(--muted))]">
                {t(locale, "projDependsFromLine")} {rel.fromProject.company.name} / {rel.fromProject.name} →{" "}
                {t(locale, "projThisProject")}
              </div>
              {rel.note ? <p className="mt-1 text-xs text-[hsl(var(--muted))]">{rel.note}</p> : null}
            </li>
          ))}
          {!project.outgoingRelations.length && !project.incomingRelations.length ? (
            <li className="text-sm text-[hsl(var(--muted))]">{t(locale, "projNoRelations")}</li>
          ) : null}
        </ul>
      </Card>

      {canManage ? (
        <Card className="space-y-4 p-4">
          <CardTitle>{t(locale, "projEditProject")}</CardTitle>
          <form action={updateProjectAction} className="space-y-3">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "commonName")}</label>
              <Input name="name" defaultValue={project.name} required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "commonDescription")}</label>
              <textarea
                name="description"
                rows={3}
                defaultValue={project.description ?? ""}
                className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "commonOwner")}</label>
              <Select name="ownerId" defaultValue={project.ownerId}>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium">{t(locale, "commonPriority")}</label>
                <Select name="priority" defaultValue={project.priority}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {tPriority(locale, p)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">{t(locale, "commonStatus")}</label>
                <Select name="status" defaultValue={project.status}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {tProjectStatus(locale, s)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <Button type="submit">{t(locale, "btnSave")}</Button>
          </form>
          <div className="flex gap-2 border-t pt-4">
            {project.status !== "ARCHIVED" ? (
              <form action={archiveProjectAction}>
                <input type="hidden" name="projectId" value={project.id} />
                <Button type="submit" variant="secondary">
                  {t(locale, "projArchive")}
                </Button>
              </form>
            ) : (
              <form action={restoreProjectAction}>
                <input type="hidden" name="projectId" value={project.id} />
                <Button type="submit" variant="secondary">
                  {t(locale, "projRestore")}
                </Button>
              </form>
            )}
          </div>
          {canSoftDeleteProject ? (
            <form action={softDeleteProjectAction} className="border-t pt-4">
              <input type="hidden" name="projectId" value={project.id} />
              <Button type="submit" variant="secondary" className="border border-rose-600/30 bg-rose-600/5 text-rose-900 dark:text-rose-100">
                {t(locale, "projMoveTrash")}
              </Button>
            </form>
          ) : null}
        </Card>
      ) : null}

      <Card className="space-y-2 p-4">
        <CardTitle>{t(locale, "projMembersTitle")}</CardTitle>
        {canMemberManage ? (
          <form action={assignMultipleToProjectAction} className="mb-3 space-y-2 border-b pb-3">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "projAddStaffHelp")}</label>
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
              <label className="text-xs font-medium">{t(locale, "projRoleInProject")}</label>
              <Select name="roleDefinitionId" required className="min-w-[220px]">
                {projectRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.displayName}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="secondary">
              {t(locale, "projAddSelectedBtn")}
            </Button>
          </form>
        ) : null}
        <ul className="space-y-2 text-sm">
          {project.memberships.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[hsl(var(--border))] px-2 py-1">
              <span>
                {m.user.name} — {m.roleDefinition.displayName}
                {m.user.active ? "" : ` · ${t(locale, "projInactive")}`}
              </span>
              {canMemberManage ? (
                <form action={removeProjectMembershipAction}>
                  <input type="hidden" name="userId" value={m.userId} />
                  <input type="hidden" name="projectId" value={project.id} />
                  <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                    {t(locale, "btnRemove")}
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "projStaffMultiCompanyHint")}</p>
      </Card>

      <Card className="space-y-3 p-4">
        <CardTitle>{t(locale, "projRecognitionWall")}</CardTitle>
        {canRecognize ? (
          <form action={createRecognitionAction} className="mb-3 grid gap-2 border-b pb-3 md:grid-cols-2">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "projRecToMember")}</label>
              <Select name="toUserId" required>
                <option value="">{t(locale, "commonSelectMember")}</option>
                {project.memberships.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.user.name}</option>
                ))}
              </Select>
            </div>
            <div className="md:col-span-2">
              <RecognitionSecondarySelect defaultCategory="COLLABORATION" locale={locale} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "projRecLinkNode")}</label>
              <Select name="workflowNodeId">
                <option value="">—</option>
                {project.nodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.title}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "projRecLinkKnowledge")}</label>
              <Select name="knowledgeAssetId">
                <option value="">—</option>
                {project.knowledgeAssets.map((k) => (
                  <option key={k.id} value={k.id}>{k.title}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "projRecIdentity")}</label>
              <Select name="mode" defaultValue={RecognitionMode.PUBLIC}>
                <option value={RecognitionMode.PUBLIC}>{tRecognitionMode(locale, RecognitionMode.PUBLIC)}</option>
                <option value={RecognitionMode.SEMI_ANONYMOUS}>
                  {tRecognitionMode(locale, RecognitionMode.SEMI_ANONYMOUS)}
                </option>
                <option value={RecognitionMode.ANONYMOUS}>{tRecognitionMode(locale, RecognitionMode.ANONYMOUS)}</option>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">{t(locale, "projRecComment")}</label>
              <Input name="message" placeholder={t(locale, "projRecCommentPh")} />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" variant="secondary">{t(locale, "projRecSend")}</Button>
            </div>
          </form>
        ) : null}

        {project.recognitions.length ? (
          <ul className="space-y-2 text-sm">
            {project.recognitions.map((r) => (
              <li key={r.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
                <div className="font-medium">
                  {r.secondaryLabelKey
                    ? displayRecognitionSecondary(r.tagCategory, r.secondaryLabelKey, locale)
                    : (r.tagLabel ?? r.secondaryLabelKey)}
                </div>
                <div className="text-xs text-[hsl(var(--muted))]">
                  {tRecognitionTagCategory(locale, r.tagCategory)} · {t(locale, "projRecTo")} {r.toUser.name} ·{" "}
                  {t(locale, "projRecBy")} {r.fromUser?.name ?? t(locale, "projRecAnonymous")}
                </div>
                {r.message ? <p className="mt-1 text-sm">{r.message}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "projRecEmpty")}</p>
        )}
      </Card>

      {canFeedback ? (
        <Card className="space-y-3 p-4">
          <CardTitle>{t(locale, "projGrowthCard")}</CardTitle>
          <p className="text-xs text-[hsl(var(--muted))]">
            {t(locale, "projGrowthCardIntro")}
          </p>
          <form action={createFeedbackEventAction} className="grid gap-2 md:grid-cols-2">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "projFeedAboutMember")}</label>
              <Select name="toUserId" required>
                <option value="">{t(locale, "commonSelectMember")}</option>
                {project.memberships.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.user.name}</option>
                ))}
              </Select>
            </div>
            <div className="md:col-span-2">
              <FeedbackSecondarySelect defaultCategory="COMMUNICATION" locale={locale} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">{t(locale, "projGrowthNote")}</label>
              <Input name="message" placeholder={t(locale, "projFeedPlaceholder")} />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" variant="secondary">{t(locale, "projFeedRecordBtn")}</Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card className="space-y-3 p-4">
        <CardTitle>{t(locale, "projKnowledgeLinkedTitle")}</CardTitle>
        {project.knowledgeAssets.length ? (
          <ul className="space-y-2 text-sm">
            {project.knowledgeAssets.map((asset) => (
              <li key={asset.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
                <div className="font-medium">{asset.title}</div>
                <div className="text-xs text-[hsl(var(--muted))]">
                  {tKnowledgeLayer(locale, asset.layer)} · {t(locale, "kbByAuthor")} {asset.author.name}
                </div>
                {asset.summary ? <p className="mt-1 text-xs text-[hsl(var(--muted))]">{asset.summary}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[hsl(var(--muted))]">
            {t(locale, "projKnowledgeEmpty")}{" "}
            <Link className="underline" href="/knowledge">
              {t(locale, "projKnowledgeOpenLink")}
            </Link>
          </p>
        )}
      </Card>
    </div>
  );
}
