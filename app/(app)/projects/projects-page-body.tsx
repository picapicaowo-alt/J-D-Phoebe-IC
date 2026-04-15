import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { Priority, ProjectStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { canManageCompanyProjects, canManageProject, canViewProject, isCompanyAdmin, isGroupAdmin, type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormSubmitButton } from "@/components/form-submit-button";
import { countdownPhrase, isOverdue } from "@/lib/deadlines";
import { getLocale } from "@/lib/locale";
import { t, tPriority, tProjectStatus } from "@/lib/messages";
import {
  createProjectGroupAction,
  deleteProjectGroupAction,
  updateProjectGroupAction,
} from "@/app/actions/project-group";
import { ProjectsGroupedBoard, type GroupedProjectCard, type ProjectGroupRow } from "@/components/projects-grouped-board";

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

function dueWhere(due: string): Prisma.ProjectWhereInput | null {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (due === "overdue") {
    return {
      deadline: { lt: startOfToday, not: null },
      status: { notIn: ["COMPLETED", "CANCELLED", "ARCHIVED"] },
    };
  }
  if (due === "7d") {
    const end = new Date(startOfToday);
    end.setDate(end.getDate() + 8);
    return { deadline: { not: null, gte: startOfToday, lt: end } };
  }
  if (due === "30d") {
    const end = new Date(startOfToday);
    end.setDate(end.getDate() + 31);
    return { deadline: { not: null, gte: startOfToday, lt: end } };
  }
  if (due === "none") return { deadline: null };
  return null;
}

export async function ProjectsPageBody({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = (await requireUser()) as AccessUser;
  const locale = await getLocale();
  if (!(await userHasPermission(user, "project.read"))) redirect("/staff");

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const companyIdRaw = typeof sp.companyId === "string" ? sp.companyId.trim() : "";
  const departmentIdRaw = typeof sp.departmentId === "string" ? sp.departmentId.trim() : "";
  const statusRaw = typeof sp.status === "string" ? sp.status.trim() : "";
  const priorityRaw = typeof sp.priority === "string" ? sp.priority.trim() : "";
  const due = typeof sp.due === "string" ? sp.due.trim() : "";

  const companyRows = await prisma.company.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, orgGroupId: true },
  });
  const companyOptions = companyRows.filter(
    (c) =>
      user.isSuperAdmin ||
      isGroupAdmin(user, c.orgGroupId) ||
      isCompanyAdmin(user, c.id) ||
      user.projectMemberships.some((m) => m.project.companyId === c.id),
  );
  const companyId =
    companyIdRaw && companyOptions.some((c) => c.id === companyIdRaw) ? companyIdRaw : "";

  let departmentId = "";
  if (companyId && departmentIdRaw) {
    const depOk = await prisma.department.findFirst({
      where: { id: departmentIdRaw, companyId },
    });
    if (depOk) departmentId = departmentIdRaw;
  }

  const departmentOptions = companyId
    ? await prisma.department.findMany({
        where: { companyId },
        orderBy: { sortOrder: "asc" },
      })
    : [];

  const projectGroups: ProjectGroupRow[] = companyId
    ? await prisma.projectGroup.findMany({
        where: { companyId },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, sortOrder: true },
      })
    : [];

  const parts: Prisma.ProjectWhereInput[] = [{ deletedAt: null }];
  if (q) {
    parts.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (companyId) parts.push({ companyId });
  if (departmentId) parts.push({ departmentId });
  if (statusRaw && STATUSES.includes(statusRaw as ProjectStatus)) {
    parts.push({ status: statusRaw as ProjectStatus });
  }
  if (priorityRaw && PRIORITIES.includes(priorityRaw as Priority)) {
    parts.push({ priority: priorityRaw as Priority });
  }
  const duePart = dueWhere(due);
  if (duePart) parts.push(duePart);

  const where: Prisma.ProjectWhereInput = { AND: parts };

  const projects = await prisma.project.findMany({
    where,
    orderBy: [{ projectGroupId: "asc" }, { groupSortOrder: "asc" }, { updatedAt: "desc" }],
    take: 200,
    include: {
      company: { include: { orgGroup: true } },
      owner: true,
      department: { select: { id: true, name: true } },
      projectGroup: { select: { id: true, name: true } },
      _count: { select: { outgoingRelations: true, incomingRelations: true, knowledgeAssets: true } },
    },
  });

  const visible = projects.filter((p) => canViewProject(user, { ...p, company: p.company }));
  const canCreate = await userHasPermission(user, "project.create");

  const selectedCo = companyId ? (companyOptions.find((c) => c.id === companyId) ?? null) : null;
  const canManageCompanyStructure =
    !!selectedCo && canManageCompanyProjects(user, { id: selectedCo.id, orgGroupId: selectedCo.orgGroupId });

  const movableProjectIds = visible
    .filter(
      (p) =>
        canManageProject(user, p) ||
        canManageCompanyProjects(user, { id: p.companyId, orgGroupId: p.company.orgGroupId }),
    )
    .map((p) => p.id);

  const boardCards: GroupedProjectCard[] = visible.map((p) => ({
    id: p.id,
    name: p.name,
    companyId: p.companyId,
    companyName: p.company.name,
    ownerName: p.owner.name,
    statusLabel: tProjectStatus(locale, p.status),
    priorityLabel: tPriority(locale, p.priority),
    relationsCount: p._count.outgoingRelations + p._count.incomingRelations,
    knowledgeCount: p._count.knowledgeAssets,
    deadlineLabel: p.deadline ? countdownPhrase(p.deadline) : null,
    overdue: p.deadline ? isOverdue(p.deadline) : false,
    statusCompleted: p.status === "COMPLETED",
    projectGroupId: p.projectGroupId,
    groupSortOrder: p.groupSortOrder,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t(locale, "projectsTitle")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-[hsl(var(--muted))]">{t(locale, "projectsPageLead")}</p>
        </div>
        {canCreate ? (
          <Link href="/projects/new" className="text-sm font-medium text-[hsl(var(--accent))] hover:underline">
            {t(locale, "projectsNew")}
          </Link>
        ) : null}
      </div>

      <form
        method="get"
        action="/projects"
        className="grid gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8"
      >
        <div className="space-y-1 sm:col-span-2 lg:col-span-2 xl:col-span-2">
          <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "projectsSearchLabel")}</label>
          <Input name="q" type="search" defaultValue={q} placeholder={t(locale, "projectsSearchPlaceholder")} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "projectsFilterCompany")}</label>
          <Select name="companyId" defaultValue={companyId}>
            <option value="">{t(locale, "projectsFilterAllCompanies")}</option>
            {companyOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "projectsFilterDepartment")}</label>
          <Select name="departmentId" defaultValue={departmentId} disabled={!companyId}>
            <option value="">{t(locale, "projectsFilterAnyDepartment")}</option>
            {departmentOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "projectsFilterCategory")}</label>
          <Select name="status" defaultValue={statusRaw}>
            <option value="">{t(locale, "projectsFilterAnyStatus")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {tProjectStatus(locale, s)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "projectsFilterPriority")}</label>
          <Select name="priority" defaultValue={priorityRaw}>
            <option value="">{t(locale, "projectsFilterAnyPriority")}</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {tPriority(locale, p)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "projectsFilterDue")}</label>
          <Select name="due" defaultValue={due}>
            <option value="">{t(locale, "projectsDueAny")}</option>
            <option value="7d">{t(locale, "projectsDue7d")}</option>
            <option value="30d">{t(locale, "projectsDue30d")}</option>
            <option value="overdue">{t(locale, "projectsDueOverdue")}</option>
            <option value="none">{t(locale, "projectsDueNone")}</option>
          </Select>
        </div>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-2 xl:col-span-8">
          <FormSubmitButton type="submit" variant="secondary">
            {t(locale, "projectsFilterApply")}
          </FormSubmitButton>
          <Link
            href="/projects"
            className="inline-flex items-center justify-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
          >
            {t(locale, "projectsFilterReset")}
          </Link>
        </div>
      </form>

      {companyId && visible.length ? (
        <div className="space-y-4">
          <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "projectsGroupedWhenCompany")}</p>
          {canManageCompanyStructure ? (
            <Card className="space-y-4 p-4">
              <h2 className="text-sm font-semibold">{t(locale, "projectsGroupsManageTitle")}</h2>
              <form action={createProjectGroupAction} className="flex flex-wrap items-end gap-2 border-b border-[hsl(var(--border))] pb-4">
                <input type="hidden" name="companyId" value={companyId} />
                <div className="min-w-[200px] flex-1 space-y-1">
                  <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "projectsGroupNewPlaceholder")}</label>
                  <Input name="name" required placeholder={t(locale, "projectsGroupNewPlaceholder")} />
                </div>
                <FormSubmitButton type="submit" variant="secondary" pendingLabel={t(locale, "projectsGroupAddBtn")}>
                  {t(locale, "projectsGroupAddBtn")}
                </FormSubmitButton>
              </form>
              <ul className="space-y-2 text-sm">
                {projectGroups.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-end gap-2 rounded-md border border-[hsl(var(--border))] p-2">
                    <form action={updateProjectGroupAction} className="flex flex-1 flex-wrap items-end gap-2">
                      <input type="hidden" name="projectGroupId" value={g.id} />
                      <Input name="name" defaultValue={g.name} required className="min-w-[160px] flex-1 text-sm" />
                      <FormSubmitButton type="submit" variant="secondary" className="h-8 text-xs" pendingLabel="…">
                        {t(locale, "projectsGroupRenameSave")}
                      </FormSubmitButton>
                    </form>
                    <form action={deleteProjectGroupAction}>
                      <input type="hidden" name="projectGroupId" value={g.id} />
                      <FormSubmitButton type="submit" variant="secondary" className="h-8 text-xs" pendingLabel="…">
                        {t(locale, "projectsGroupUngroupBtn")}
                      </FormSubmitButton>
                    </form>
                  </li>
                ))}
                {!projectGroups.length ? (
                  <li className="text-xs text-[hsl(var(--muted))]">{t(locale, "projectsNoGroupsYet")}</li>
                ) : null}
              </ul>
            </Card>
          ) : null}
          <ProjectsGroupedBoard
            groups={projectGroups}
            projects={boardCards}
            movableProjectIds={movableProjectIds}
            copy={{
              ungroupedTitle: t(locale, "projectsUngroupedSection"),
              dragHint: t(locale, "projectsDragBetweenGroups"),
              detail: t(locale, "projectsLinkDetail"),
              ownerPrefix: t(locale, "projectsOwnerPrefix"),
              metaRelations: t(locale, "projectsMetaRelations"),
              metaKnowledge: t(locale, "projectsMetaKnowledge"),
            }}
          />
        </div>
      ) : (
        <div className="grid gap-3">
          {visible.length ? (
            visible.map((p) => (
              <Card key={p.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div>
                  <Link className="text-base font-semibold hover:underline" href={`/projects/${p.id}`}>
                    {p.name}
                  </Link>
                  <div className="text-xs text-[hsl(var(--muted))]">
                    {p.company.name} · {t(locale, "projectsOwnerPrefix")} {p.owner.name}
                    {p.department ? (
                      <>
                        {" · "}
                        {p.department.name}
                      </>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    <span>{tProjectStatus(locale, p.status)}</span>
                    <span>·</span>
                    <span>{tPriority(locale, p.priority)}</span>
                    <span>·</span>
                    <span>
                      {t(locale, "projectsMetaRelations")}{" "}
                      {p._count.outgoingRelations + p._count.incomingRelations}
                    </span>
                    <span>·</span>
                    <span>
                      {t(locale, "projectsMetaKnowledge")} {p._count.knowledgeAssets}
                    </span>
                    {p.deadline ? (
                      <>
                        <span>·</span>
                        <span className={isOverdue(p.deadline) && p.status !== "COMPLETED" ? "text-rose-600" : ""}>
                          {countdownPhrase(p.deadline)}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="flex gap-2 text-sm">
                  <Link className="text-[hsl(var(--accent))] hover:underline" href={`/projects/${p.id}`}>
                    {t(locale, "projectsLinkDetail")}
                  </Link>
                </div>
              </Card>
            ))
          ) : (
            <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "projectsFilteredEmpty")}</p>
          )}
        </div>
      )}
    </div>
  );
}
