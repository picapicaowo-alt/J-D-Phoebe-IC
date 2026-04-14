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
import { requireUser } from "@/lib/auth";
import { canEditProjectMap, canManageProject, canViewProject, type AccessUser } from "@/lib/access";
import { getLocale } from "@/lib/locale";
import { displayRecognitionSecondary } from "@/lib/recognition-catalog";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { labelNodeType, labelPriority, labelProjectStatus, labelRecognitionCategory } from "@/lib/labels";
import { countdownPhrase, isOverdue } from "@/lib/deadlines";
import { RecognitionSecondarySelect } from "@/components/recognition-secondary-select";
import { FeedbackSecondarySelect } from "@/components/feedback-secondary-select";

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
        <Link href="/projects">Projects</Link> / {project.name}
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted))]">Project Summary</p>
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted))]">
          {project.company.name} · {labelProjectStatus(project.status)} · {labelPriority(project.priority)}
        </p>
        {project.deadline ? (
          <p className="mt-1 text-xs text-[hsl(var(--muted))]">
            {countdownPhrase(project.deadline)}
            {isOverdue(project.deadline) && project.status !== "COMPLETED" ? " · overdue" : ""}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={`/projects/${project.id}/workflow`}>
          <Button type="button">Open advanced workflow view</Button>
        </Link>
      </div>

      <Card className="space-y-3 p-4">
        <CardTitle>Project map (lightweight default)</CardTitle>
        <p className="text-xs text-[hsl(var(--muted))]">
          Route-map style overview for daily use. Use Advanced Workflow for complex graph editing.
        </p>
        <div className="space-y-2">
          {project.nodes.length ? (
            [...project.layers, { id: "__ungrouped__", name: "Ungrouped lane" }].map((layer) => {
              const laneNodes = project.nodes.filter((n) =>
                layer.id === "__ungrouped__" ? !n.layerId : n.layerId === layer.id,
              );
              if (!laneNodes.length) return null;
              return (
                <div key={layer.id} className="space-y-2 rounded-md border border-dashed border-[hsl(var(--border))] p-2">
                  <div className="text-xs font-medium text-[hsl(var(--muted))]">{layer.name}</div>
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
                      {labelNodeType(n.nodeType)} · {n.status}
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
            <p className="text-sm text-[hsl(var(--muted))]">No map nodes yet. Add them in the advanced workflow view.</p>
          )}
        </div>
        <div className="text-xs text-[hsl(var(--muted))]">
          {project.nodes.length} nodes · {project.edges.length} dependencies
        </div>
      </Card>

      {canEditMap ? (
        <Card className="space-y-4 p-4">
          <CardTitle>Edit project map</CardTitle>
          <p className="text-xs text-[hsl(var(--muted))]">
            Lightweight edits stay on this page. Open Advanced Workflow for full graph layout and attachment tools.
          </p>
          <form action={createProjectMapNodeAction} className="grid gap-2 border-b pb-3 md:grid-cols-3">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">New node title</label>
              <Input name="title" required placeholder="Node title" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Type</label>
              <Select name="nodeType" defaultValue="TASK">
                {NODE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {labelNodeType(t)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1 md:col-span-3">
              <label className="text-xs font-medium">Layer</label>
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
                Add node
              </Button>
            </div>
          </form>
          <form action={createProjectMapEdgeAction} className="grid gap-2 border-b pb-3 md:grid-cols-3">
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="kind" value={WorkflowEdgeKind.DEPENDENCY} />
            <div className="space-y-1">
              <label className="text-xs font-medium">From node</label>
              <Select name="fromNodeId" required>
                <option value="">Select</option>
                {project.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">To node</label>
              <Select name="toNodeId" required>
                <option value="">Select</option>
                {project.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" variant="secondary">
                Add dependency
              </Button>
            </div>
          </form>
          <div className="space-y-2 text-sm">
            <p className="text-xs font-medium text-[hsl(var(--muted))]">Nodes</p>
            <ul className="space-y-2">
              {project.nodes.map((n) => (
                <li key={n.id} className="rounded-md border border-[hsl(var(--border))] p-2">
                  <form action={updateProjectMapNodeAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="nodeId" value={n.id} />
                    <Input name="title" defaultValue={n.title} className="min-w-[160px]" required />
                    <Select name="status" defaultValue={n.status} className="min-w-[140px]">
                      {NODE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                    <Select name="nodeType" defaultValue={n.nodeType} className="min-w-[120px]">
                      {NODE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {labelNodeType(t)}
                        </option>
                      ))}
                    </Select>
                    <Input name="sortOrder" type="number" defaultValue={String(n.sortOrder)} className="w-20" />
                    <Button type="submit" variant="secondary" className="h-8 text-xs">
                      Save
                    </Button>
                  </form>
                  <form action={softDeleteProjectMapNodeAction} className="mt-1">
                    <input type="hidden" name="nodeId" value={n.id} />
                    <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                      Remove node
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
        <CardTitle>Project relations (project-level)</CardTitle>
        {canManage ? (
          <form action={addProjectRelationAction} className="grid gap-2 border-b pb-3 md:grid-cols-3">
            <input type="hidden" name="fromProjectId" value={project.id} />
            <div className="space-y-1">
              <label className="text-xs font-medium">Relation type</label>
              <Select name="relationType" defaultValue="LINKED" required>
                {RELATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Target project</label>
              <Select name="toProjectId" required>
                <option value="">Select project</option>
                {relationTargetProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.company.name} / {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Note</label>
              <Input name="note" placeholder="Optional relation context" />
            </div>
            <div className="md:col-span-3">
              <Button type="submit" variant="secondary">
                Add relation
              </Button>
            </div>
          </form>
        ) : null}
        <ul className="space-y-2 text-sm">
          {project.outgoingRelations.map((rel) => (
            <li key={rel.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
              <div className="font-medium">{rel.relationType}</div>
              <div className="text-xs text-[hsl(var(--muted))]">
                This project → {rel.toProject.company.name} / {rel.toProject.name}
              </div>
              {rel.note ? <p className="mt-1 text-xs text-[hsl(var(--muted))]">{rel.note}</p> : null}
              {canManage ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <details>
                    <summary className="cursor-pointer text-xs text-[hsl(var(--muted))] underline underline-offset-2">
                      Edit note
                    </summary>
                    <form action={updateProjectRelationNoteAction} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="relationId" value={rel.id} />
                      <Input
                        name="note"
                        defaultValue={rel.note ?? ""}
                        placeholder="Edit note"
                        className="h-7 min-w-[220px] text-xs"
                      />
                      <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                        Save note
                      </Button>
                    </form>
                  </details>
                  <form action={removeProjectRelationAction}>
                    <input type="hidden" name="relationId" value={rel.id} />
                    <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                      Remove
                    </Button>
                  </form>
                </div>
              ) : null}
            </li>
          ))}
          {project.incomingRelations.map((rel) => (
            <li key={rel.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
              <div className="font-medium">{rel.relationType}</div>
              <div className="text-xs text-[hsl(var(--muted))]">
                Depends from {rel.fromProject.company.name} / {rel.fromProject.name} → this project
              </div>
              {rel.note ? <p className="mt-1 text-xs text-[hsl(var(--muted))]">{rel.note}</p> : null}
            </li>
          ))}
          {!project.outgoingRelations.length && !project.incomingRelations.length ? (
            <li className="text-sm text-[hsl(var(--muted))]">No project-level relation declared yet.</li>
          ) : null}
        </ul>
      </Card>

      {canManage ? (
        <Card className="space-y-4 p-4">
          <CardTitle>Edit project</CardTitle>
          <form action={updateProjectAction} className="space-y-3">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="space-y-1">
              <label className="text-xs font-medium">Name</label>
              <Input name="name" defaultValue={project.name} required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Description</label>
              <textarea
                name="description"
                rows={3}
                defaultValue={project.description ?? ""}
                className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Owner</label>
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
                <label className="text-xs font-medium">Priority</label>
                <Select name="priority" defaultValue={project.priority}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {labelPriority(p)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Status</label>
                <Select name="status" defaultValue={project.status}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {labelProjectStatus(s)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <Button type="submit">Save</Button>
          </form>
          <div className="flex gap-2 border-t pt-4">
            {project.status !== "ARCHIVED" ? (
              <form action={archiveProjectAction}>
                <input type="hidden" name="projectId" value={project.id} />
                <Button type="submit" variant="secondary">
                  Archive project
                </Button>
              </form>
            ) : (
              <form action={restoreProjectAction}>
                <input type="hidden" name="projectId" value={project.id} />
                <Button type="submit" variant="secondary">
                  Restore project
                </Button>
              </form>
            )}
          </div>
          {canSoftDeleteProject ? (
            <form action={softDeleteProjectAction} className="border-t pt-4">
              <input type="hidden" name="projectId" value={project.id} />
              <Button type="submit" variant="secondary" className="border border-rose-600/30 bg-rose-600/5 text-rose-900 dark:text-rose-100">
                Move project to trash
              </Button>
            </form>
          ) : null}
        </Card>
      ) : null}

      <Card className="space-y-2 p-4">
        <CardTitle>Project members</CardTitle>
        {canMemberManage ? (
          <form action={assignMultipleToProjectAction} className="mb-3 space-y-2 border-b pb-3">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="space-y-1">
              <label className="text-xs font-medium">Add one or more staff (hold Cmd/Ctrl to multi-select)</label>
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
              <label className="text-xs font-medium">Role in project</label>
              <Select name="roleDefinitionId" required className="min-w-[220px]">
                {projectRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.displayName}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="secondary">
              Add selected to project
            </Button>
          </form>
        ) : null}
        <ul className="space-y-2 text-sm">
          {project.memberships.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[hsl(var(--border))] px-2 py-1">
              <span>
                {m.user.name} — {m.roleDefinition.displayName}
                {m.user.active ? "" : " · inactive"}
              </span>
              {canMemberManage ? (
                <form action={removeProjectMembershipAction}>
                  <input type="hidden" name="userId" value={m.userId} />
                  <input type="hidden" name="projectId" value={project.id} />
                  <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                    Remove
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[hsl(var(--muted))]">Staff can belong to multiple companies and multiple projects.</p>
      </Card>

      <Card className="space-y-3 p-4">
        <CardTitle>Recognition wall</CardTitle>
        {canRecognize ? (
          <form action={createRecognitionAction} className="mb-3 grid gap-2 border-b pb-3 md:grid-cols-2">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="space-y-1">
              <label className="text-xs font-medium">To member</label>
              <Select name="toUserId" required>
                <option value="">Select member</option>
                {project.memberships.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.user.name}</option>
                ))}
              </Select>
            </div>
            <div className="md:col-span-2">
              <RecognitionSecondarySelect defaultCategory="COLLABORATION" locale={locale} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Link to node (optional)</label>
              <Select name="workflowNodeId">
                <option value="">—</option>
                {project.nodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.title}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Link to knowledge (optional)</label>
              <Select name="knowledgeAssetId">
                <option value="">—</option>
                {project.knowledgeAssets.map((k) => (
                  <option key={k.id} value={k.id}>{k.title}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Identity mode</label>
              <Select name="mode" defaultValue={RecognitionMode.PUBLIC}>
                <option value={RecognitionMode.PUBLIC}>Named (public)</option>
                <option value={RecognitionMode.SEMI_ANONYMOUS}>Semi-anonymous</option>
                <option value={RecognitionMode.ANONYMOUS}>Anonymous</option>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">Comment (optional)</label>
              <Input name="message" placeholder="What was valuable in this contribution?" />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" variant="secondary">Send recognition</Button>
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
                  {labelRecognitionCategory(r.tagCategory)} · to {r.toUser.name} · by {r.fromUser?.name ?? "Anonymous"}
                </div>
                {r.message ? <p className="mt-1 text-sm">{r.message}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[hsl(var(--muted))]">No recognition yet for this project.</p>
        )}
      </Card>

      {canFeedback ? (
        <Card className="space-y-3 p-4">
          <CardTitle>Growth observations (structured)</CardTitle>
          <p className="text-xs text-[hsl(var(--muted))]">
            For improvement themes only. Praise stays in Recognition — this path is calm, factual, and actionable.
          </p>
          <form action={createFeedbackEventAction} className="grid gap-2 md:grid-cols-2">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="space-y-1">
              <label className="text-xs font-medium">About member</label>
              <Select name="toUserId" required>
                <option value="">Select member</option>
                {project.memberships.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.user.name}</option>
                ))}
              </Select>
            </div>
            <div className="md:col-span-2">
              <FeedbackSecondarySelect defaultCategory="COMMUNICATION" locale={locale} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">Growth note (optional)</label>
              <Input name="message" placeholder="What would help them improve?" />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" variant="secondary">Record observation</Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card className="space-y-3 p-4">
        <CardTitle>Knowledge assets linked to this project</CardTitle>
        {project.knowledgeAssets.length ? (
          <ul className="space-y-2 text-sm">
            {project.knowledgeAssets.map((asset) => (
              <li key={asset.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
                <div className="font-medium">{asset.title}</div>
                <div className="text-xs text-[hsl(var(--muted))]">Layer {asset.layer} · by {asset.author.name}</div>
                {asset.summary ? <p className="mt-1 text-xs text-[hsl(var(--muted))]">{asset.summary}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[hsl(var(--muted))]">
            No knowledge assets linked yet. Add from <Link className="underline" href="/knowledge">Knowledge</Link>.
          </p>
        )}
      </Card>
    </div>
  );
}
