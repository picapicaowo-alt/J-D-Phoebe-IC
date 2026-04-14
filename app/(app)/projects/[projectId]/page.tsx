import Link from "next/link";
import { notFound } from "next/navigation";
import { Priority, ProjectRelationType, ProjectStatus } from "@prisma/client";
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
import { addExternalResourceLinkAction } from "@/app/actions/attachments";
import { requireUser } from "@/lib/auth";
import { canEditProjectMap, canManageProject, canViewProject, type AccessUser } from "@/lib/access";
import { getLocale } from "@/lib/locale";
import { t, tKnowledgeLayer, tPriority, tProjectRelationType, tProjectStatus } from "@/lib/messages";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { countdownPhrase, isOverdue } from "@/lib/deadlines";
import { AttachmentVersionTree } from "@/components/attachment-version-tree";
import { ProjectMapNestedNodes } from "@/components/project-map-nested-nodes";
import { ProjectTaskStructureEditor } from "@/components/project-task-structure-editor";
import { UserFace } from "@/components/user-face";
import { DetailsHashOpener } from "@/components/details-hash-opener";
import { combinedProjectProgressPercent, projectStatusVisualClasses } from "@/lib/project-health";
import { projectRollupPercentFromTasks } from "@/lib/task-progress";
import { MAX_TASK_DEPTH, childrenByParentId, depthFromRoot, canSetParent } from "@/lib/workflow-node-tree";

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
        include: {
          assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        },
      },
      edges: {
        where: { deletedAt: null },
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

  const progressPct =
    project.nodes.length > 0
      ? projectRollupPercentFromTasks(
          project.nodes.map((n) => ({
            id: n.id,
            parentNodeId: n.parentNodeId,
            sortOrder: n.sortOrder,
            progressPercent: n.progressPercent,
            status: n.status,
          })),
        )
      : combinedProjectProgressPercent(project.progressPercent, project.nodes);
  const statusVis = projectStatusVisualClasses(project.status);
  const relationCount = project.outgoingRelations.length + project.incomingRelations.length;
  const layerLanes = [...project.layers, { id: "__ungrouped__", name: "" }];
  const treeMeta = project.nodes.map((n) => ({
    id: n.id,
    parentNodeId: n.parentNodeId,
    sortOrder: n.sortOrder,
  }));
  const byIdTree = new Map(treeMeta.map((r) => [r.id, r]));
  const byParentTree = childrenByParentId(treeMeta);
  const eligibleParents = project.nodes.filter((n) => depthFromRoot(byIdTree, n.id) < MAX_TASK_DEPTH);
  const eligibleParentIds = new Set(eligibleParents.map((n) => n.id));

  const primaryBtn =
    "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium bg-[hsl(var(--accent))] text-white hover:opacity-90";
  const secondaryBtn =
    "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium bg-[hsl(var(--card))] border border-[hsl(var(--border))] hover:bg-black/5 dark:hover:bg-white/5";

  return (
    <div className="space-y-6">
      <DetailsHashOpener />
      <div className="text-xs text-[hsl(var(--muted))]">
        <Link href="/projects">{t(locale, "projBreadcrumbProjects")}</Link> / {project.name}
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
        <Link href={`/projects/${project.id}/workflow`}>
          <Button type="button" variant="secondary">
            {t(locale, "wfOpenAdvanced")}
          </Button>
        </Link>
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200/90 bg-[hsl(var(--card))] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-[hsl(var(--border))]">
        <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted))]">{t(locale, "projSummary")}</p>
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
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
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
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusVis.pill}`}
            title={t(locale, "commonStatus")}
          >
            {tProjectStatus(locale, project.status)}
          </span>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-[hsl(var(--muted))]">
            <span>{t(locale, "projProgressOverall")}</span>
            <span className="font-medium text-[hsl(var(--foreground))]">{progressPct}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div className="h-full rounded-full bg-zinc-900 dark:bg-zinc-100" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-stretch gap-3 rounded-xl border border-zinc-200/90 bg-[hsl(var(--card))] px-4 py-3 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-[hsl(var(--border))]">
        <div className="min-w-[140px] flex-1 space-y-1 border-r border-[hsl(var(--border))] pr-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">
            {t(locale, "projDetailsSnapshot")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {project.company.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={project.company.logoUrl}
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 rounded border border-[hsl(var(--border))] bg-white object-contain p-0.5 dark:bg-zinc-900"
              />
            ) : null}
            <span className="font-medium">{project.company.name}</span>
          </div>
        </div>
        <div className="flex min-w-[100px] flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase text-[hsl(var(--muted))]">{t(locale, "commonStatus")}</span>
          <span className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${statusVis.pill}`}>
            {tProjectStatus(locale, project.status)}
          </span>
        </div>
        <div className="flex min-w-[90px] flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase text-[hsl(var(--muted))]">{t(locale, "commonPriority")}</span>
          <span className="text-xs">{tPriority(locale, project.priority)}</span>
        </div>
        <div className="min-w-[120px] flex-1 space-y-1">
          <span className="text-[10px] font-semibold uppercase text-[hsl(var(--muted))]">{t(locale, "projProgressOverall")}</span>
            <div className="flex items-center gap-2">
            <div className="h-2 min-w-[72px] flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
              <div className="h-2 rounded-full bg-zinc-900 dark:bg-zinc-100" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="text-xs font-semibold">{progressPct}%</span>
          </div>
        </div>
        <div className="flex min-w-[120px] flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase text-[hsl(var(--muted))]">{t(locale, "commonOwner")}</span>
          <span className="flex items-center gap-2 text-xs">
            <UserFace name={project.owner.name} avatarUrl={project.owner.avatarUrl} size={24} />
            {project.owner.name}
          </span>
        </div>
        <div className="min-w-[160px] flex-1 space-y-1">
          <a href="#section-edit-members" className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--muted))] underline-offset-2 hover:underline">
            {t(locale, "projMembersTitle")}
          </a>
          <div className="flex flex-wrap gap-1">
            {project.memberships.slice(0, 8).map((m) => (
              <UserFace key={m.userId} name={m.user.name} avatarUrl={m.user.avatarUrl} size={26} />
            ))}
            {project.memberships.length > 8 ? (
              <span className="self-center text-xs text-[hsl(var(--muted))]">+{project.memberships.length - 8}</span>
            ) : null}
          </div>
        </div>
        <div className="flex min-w-[120px] flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase text-[hsl(var(--muted))]">{t(locale, "projDeadlineShort")}</span>
          <span className="text-xs text-[hsl(var(--muted))]">
            {project.deadline
              ? `${project.deadline.toLocaleDateString()} · ${countdownPhrase(project.deadline)}`
              : "—"}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <details
          id="section-relations"
          className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm"
        >
          <summary className="cursor-pointer select-none px-3 py-3 text-sm font-medium">
            {t(locale, "projJumpRelations")}{" "}
            <span className="text-xs font-normal text-[hsl(var(--muted))]">({relationCount})</span>
          </summary>
          <div className="max-h-[min(70vh,520px)] space-y-3 overflow-y-auto border-t border-[hsl(var(--border))] p-3 text-sm">
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
          </div>
        </details>

        <details
          id="section-knowledge"
          className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm"
        >
          <summary className="cursor-pointer select-none px-3 py-3 text-sm font-medium">
            {t(locale, "projJumpKnowledge")}{" "}
            <span className="text-xs font-normal text-[hsl(var(--muted))]">({project.knowledgeAssets.length})</span>
          </summary>
          <div className="max-h-[min(70vh,520px)] space-y-2 overflow-y-auto border-t border-[hsl(var(--border))] p-3 text-sm">
            {project.knowledgeAssets.length ? (
              <ul className="space-y-2">
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
          </div>
        </details>

        <details
          id="section-files"
          className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm"
        >
          <summary className="cursor-pointer select-none px-3 py-3 text-sm font-medium">
            {t(locale, "projJumpFiles")}{" "}
            <span className="text-xs font-normal text-[hsl(var(--muted))]">({projectFiles.length})</span>
          </summary>
          <div className="max-h-[min(70vh,520px)] space-y-3 overflow-y-auto border-t border-[hsl(var(--border))] p-3 text-sm">
            {projectFiles.length ? (
              <AttachmentVersionTree
                attachments={projectFiles.map((f) => ({
                  id: f.id,
                  previousVersionId: f.previousVersionId,
                  fileName: f.fileName,
                  createdAt: f.createdAt,
                  description: f.description,
                  resourceKind: f.resourceKind,
                  externalUrl: f.externalUrl,
                }))}
                locale={locale}
                showTrash={canManage}
              />
            ) : (
              <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "wfNoFiles")}</p>
            )}
            {canManage ? (
              <form action={addExternalResourceLinkAction} className="grid gap-2 border-t border-[hsl(var(--border))] pt-3 md:grid-cols-2">
                <input type="hidden" name="projectId" value={project.id} />
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-medium">{t(locale, "resExternalUrl")}</label>
                  <Input name="externalUrl" type="url" required placeholder="https://drive.google.com/..." className="text-xs" />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-medium">{t(locale, "resLinkLabel")}</label>
                  <Input name="label" placeholder={t(locale, "resLinkLabelPh")} className="text-xs" />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-medium">{t(locale, "commonDescription")}</label>
                  <Input name="description" className="text-xs" />
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
                    {t(locale, "resAddLink")}
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        </details>

        <Link
          href={`/projects/${project.id}/workflow`}
          className="flex flex-col justify-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-3 shadow-sm transition hover:border-[hsl(var(--accent))]/40 hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
        >
          <span className="text-sm font-medium">{t(locale, "projJumpWorkflowCard")}</span>
          <span className="mt-1 text-xs text-[hsl(var(--muted))]">{t(locale, "projJumpWorkflowHint")}</span>
        </Link>
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>{t(locale, "wfMapTitle")}</CardTitle>
            <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "wfMapCaption")}</p>
          </div>
          {canEditMap ? (
            <p className="max-w-md text-xs text-[hsl(var(--muted))]">
              <a href="#section-edit-project" className="font-medium text-[hsl(var(--accent))] underline">
                {t(locale, "projMapEdit")}
              </a>
              {" · "}
              {t(locale, "wfEditMapCaption")}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          {project.nodes.length ? (
            layerLanes.map((layer) => {
              const laneAll = project.nodes.filter((n) =>
                layer.id === "__ungrouped__" ? !n.layerId : n.layerId === layer.id,
              );
              if (!laneAll.length) return null;
              const lite = laneAll.map((n) => ({
                id: n.id,
                title: n.title,
                parentNodeId: n.parentNodeId,
                sortOrder: n.sortOrder,
                status: n.status,
                nodeType: n.nodeType,
                progressPercent: n.progressPercent,
                assignees: n.assignees.map((a) => ({
                  id: a.user.id,
                  name: a.user.name,
                  avatarUrl: a.user.avatarUrl,
                })),
              }));
              return (
                <div key={layer.id} className="space-y-2 rounded-md border border-dashed border-[hsl(var(--border))] p-2">
                  <div className="text-xs font-medium text-[hsl(var(--muted))]">
                    {layer.id === "__ungrouped__" ? t(locale, "wfUngroupedLane") : layer.name}
                  </div>
                  <ProjectMapNestedNodes nodes={lite} locale={locale} projectId={project.id} />
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


      {(canManage || canEditMap) ? (
        <details
          id="section-edit-project"
          className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm"
        >
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
            {t(locale, "projEditProject")} · {t(locale, "projDetailsSummary")}
          </summary>
          <div className="space-y-4 border-t border-[hsl(var(--border))] p-4">
            {canManage ? (
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
            ) : null}
            {canEditMap ? (
              <ProjectTaskStructureEditor
                locale={locale}
                eligibleParentIds={eligibleParentIds}
                project={{
                  id: project.id,
                  layers: project.layers.map((l) => ({ id: l.id, name: l.name })),
                  nodes: project.nodes.map((n) => ({
                    id: n.id,
                    title: n.title,
                    parentNodeId: n.parentNodeId,
                    sortOrder: n.sortOrder,
                    status: n.status,
                    nodeType: n.nodeType,
                    dueAt: n.dueAt,
                    layerId: n.layerId,
                    assignees: n.assignees,
                  })),
                  edges: project.edges.map((e) => ({
                    id: e.id,
                    fromNodeId: e.fromNodeId,
                    toNodeId: e.toNodeId,
                    kind: e.kind,
                  })),
                  memberships: project.memberships.map((m) => ({
                    userId: m.userId,
                    user: { id: m.user.id, name: m.user.name },
                  })),
                }}
              />
            ) : null}
            {canManage ? (
              <>
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
                    <Button
                      type="submit"
                      variant="secondary"
                      className="border border-rose-600/30 bg-rose-600/5 text-rose-900 dark:text-rose-100"
                    >
                      {t(locale, "projMoveTrash")}
                    </Button>
                  </form>
                ) : null}
              </>
            ) : null}
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
                    <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                      {t(locale, "btnRemove")}
                    </Button>
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
