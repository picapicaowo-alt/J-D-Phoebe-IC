import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { Priority, ProjectStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import {
  canManageCompanyProjects,
  canManageProjectSettings,
  canViewProject,
  companyVisibilityWhere,
  projectVisibilityWhere,
  type AccessUser,
} from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canCreateProjectInCompanyWithRoleIds, getActorRoleIdsByPermission } from "@/lib/scoped-role-access";
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
import { RoutePrefetcher } from "@/components/route-prefetcher";
import { softDeleteProjectsBulkAction } from "@/app/actions/trash";
import { buildDatetimeLocalValue, getZonedDateParts, parseDatetimeLocalInTimeZone } from "@/lib/timezone";
import { CompanyChip } from "@/components/company-chip";

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

function dueWhere(due: string, timeZone: string): Prisma.ProjectWhereInput | null {
  const now = new Date();
  const nowParts = getZonedDateParts(now, timeZone) ?? {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
    second: now.getSeconds(),
  };
  const startOfToday =
    parseDatetimeLocalInTimeZone(
      buildDatetimeLocalValue({ year: nowParts.year, month: nowParts.month, day: nowParts.day, hour: 0, minute: 0 }),
      timeZone,
    ) ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
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
  const notice = typeof sp.notice === "string" && (sp.notice === "deleted" || sp.notice === "missing") ? sp.notice : "";

  const [companyOptions, allCompanies, projectCreateRoleIds] = await Promise.all([
    prisma.company.findMany({
      where: { deletedAt: null, ...companyVisibilityWhere(user) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, orgGroupId: true },
    }),
    prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true, orgGroupId: true },
    }),
    getActorRoleIdsByPermission(user, ["project.create"]).then((byPermission) => byPermission.get("project.create") ?? new Set<string>()),
  ]);
  const canCreate = allCompanies.some((company) =>
    canCreateProjectInCompanyWithRoleIds(user, { id: company.id, orgGroupId: company.orgGroupId }, projectCreateRoleIds),
  );
  const companyId =
    companyIdRaw && companyOptions.some((c) => c.id === companyIdRaw) ? companyIdRaw : "";

  const [departmentOptions, projectGroups] = companyId
    ? await Promise.all([
        prisma.department.findMany({
          where: { companyId },
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true },
        }),
        prisma.projectGroup.findMany({
          where: { companyId },
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true, sortOrder: true },
        }),
      ])
    : [[], [] as ProjectGroupRow[]];

  const departmentId =
    departmentIdRaw && departmentOptions.some((d) => d.id === departmentIdRaw) ? departmentIdRaw : "";

  const parts: Prisma.ProjectWhereInput[] = [{ deletedAt: null }, projectVisibilityWhere(user)];
  if (q) {
    parts.push({
      OR: [
        { name: { contains: q } },
        { description: { contains: q } },
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
  const duePart = dueWhere(due, user.timezone);
  if (duePart) parts.push(duePart);

  const where: Prisma.ProjectWhereInput = { AND: parts };

  const projects = await prisma.project.findMany({
    where,
    orderBy: [{ projectGroupId: "asc" }, { groupSortOrder: "asc" }, { updatedAt: "desc" }],
    take: 200,
    select: {
      id: true,
      name: true,
      companyId: true,
      ownerId: true,
      status: true,
      priority: true,
      deadline: true,
      projectGroupId: true,
      groupSortOrder: true,
      deletedAt: true,
      company: { select: { id: true, name: true, orgGroupId: true, companyColor: true } },
      owner: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      projectGroup: { select: { id: true, name: true } },
      _count: { select: { outgoingRelations: true, incomingRelations: true, knowledgeAssets: true } },
    },
  });

  const visible = projects.filter((p) => canViewProject(user, { ...p, company: p.company }));

  const selectedCo = companyId ? (companyOptions.find((c) => c.id === companyId) ?? null) : null;
  const canManageCompanyStructure =
    !!selectedCo && canManageCompanyProjects(user, { id: selectedCo.id, orgGroupId: selectedCo.orgGroupId });

  const movableProjectIds = visible
    .filter((p) => canManageProjectSettings(user, p))
    .map((p) => p.id);
  const selectableProjectIds = visible.filter((p) => canManageProjectSettings(user, p)).map((p) => p.id);

  const boardCards: GroupedProjectCard[] = visible.map((p) => ({
    id: p.id,
    name: p.name,
    companyId: p.companyId,
    companyName: p.company.name,
    companyColor: p.company.companyColor,
    ownerName: p.owner.name,
    statusLabel: tProjectStatus(locale, p.status),
    priorityLabel: tPriority(locale, p.priority),
    relationsCount: p._count.outgoingRelations + p._count.incomingRelations,
    knowledgeCount: p._count.knowledgeAssets,
    deadlineLabel: p.deadline ? countdownPhrase(p.deadline, new Date(), user.timezone) : null,
    overdue: p.deadline ? isOverdue(p.deadline, new Date(), user.timezone) : false,
    statusCompleted: p.status === "COMPLETED",
    projectGroupId: p.projectGroupId,
    groupSortOrder: p.groupSortOrder,
  }));
  const projectDetailHrefs = visible.map((p) => `/projects/${p.id}`);
  const activeVisible = visible.filter((p) => p.status !== "COMPLETED");
  const completedVisible = visible.filter((p) => p.status === "COMPLETED");

  const renderProjectCard = (p: (typeof visible)[number]) => (
    <Card key={p.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <label className="inline-flex shrink-0 items-center pt-1">
          <input
            type="checkbox"
            name="projectIds"
            value={p.id}
            disabled={!selectableProjectIds.includes(p.id)}
            aria-label={`${t(locale, "projectsSelectAria")}: ${p.name}`}
            className="h-4 w-4 rounded border-[hsl(var(--border))] text-[hsl(var(--accent))] focus:ring-[hsl(var(--accent))]"
          />
        </label>
        <div>
          <Link className="text-base font-semibold hover:underline" href={`/projects/${p.id}`}>
            {p.name}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-sm leading-6 text-[hsl(var(--muted))]">
            <CompanyChip name={p.company.name} color={p.company.companyColor} className="text-[11px]" />
            <span>·</span>
            <span>
              {t(locale, "projectsOwnerPrefix")} {p.owner.name}
            </span>
            {p.department ? (
              <>
                <span>·</span>
                <span>{p.department.name}</span>
              </>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm leading-6 text-[hsl(var(--foreground))]">
            <span>{tProjectStatus(locale, p.status)}</span>
            <span>·</span>
            <span>{tPriority(locale, p.priority)}</span>
            <span>·</span>
            <span>
              {t(locale, "projectsMetaRelations")} {p._count.outgoingRelations + p._count.incomingRelations}
            </span>
            <span>·</span>
            <span>
              {t(locale, "projectsMetaKnowledge")} {p._count.knowledgeAssets}
            </span>
            {p.deadline ? (
              <>
                <span>·</span>
                <span className={isOverdue(p.deadline, new Date(), user.timezone) && p.status !== "COMPLETED" ? "text-rose-600" : ""}>
                  {countdownPhrase(p.deadline, new Date(), user.timezone)}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex gap-2 text-sm">
        <Link className="text-[hsl(var(--accent))] hover:underline" href={`/projects/${p.id}`}>
          {t(locale, "projectsLinkDetail")}
        </Link>
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      <RoutePrefetcher hrefs={projectDetailHrefs} limit={24} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t(locale, "projectsTitle")}</h1>
          <p className="mt-2 max-w-3xl text-base leading-7 text-[hsl(var(--muted))]">{t(locale, "projectsPageLead")}</p>
        </div>
        {canCreate ? (
          <Link
            href="/projects/new"
            className="inline-flex items-center justify-center rounded-md bg-[hsl(var(--primary))] px-4 py-2.5 text-base font-semibold text-white shadow-[0_4px_12px_rgba(99,102,241,0.25)] transition hover:-translate-y-px hover:bg-[hsl(var(--primary-hover))]"
          >
            {t(locale, "projectsNew")}
          </Link>
        ) : null}
      </div>

      {notice ? (
        <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>{t(locale, notice === "deleted" ? "projectsNoticeDeleted" : "projectsNoticeMissing")}</p>
            {notice === "deleted" ? (
              <Link className="font-medium underline underline-offset-4" href="/trash">
                {t(locale, "projectsNoticeOpenTrash")}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

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
          <form action={softDeleteProjectsBulkAction} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "projectsBulkTrashHint")}</p>
              <FormSubmitButton
                type="submit"
                variant="secondary"
                className="h-8 border border-rose-600/20 bg-rose-600/5 px-2.5 text-xs font-medium text-rose-700 dark:text-rose-300"
                pendingLabel="…"
                disabled={!selectableProjectIds.length}
              >
                {t(locale, "projectsBulkTrashButton")}
              </FormSubmitButton>
            </div>
            <ProjectsGroupedBoard
              groups={projectGroups}
              projects={boardCards}
              movableProjectIds={movableProjectIds}
              selectableProjectIds={selectableProjectIds}
              checkboxName="projectIds"
              copy={{
                ungroupedTitle: t(locale, "projectsUngroupedSection"),
                completedTitle: tProjectStatus(locale, "COMPLETED"),
                dragHint: t(locale, "projectsDragBetweenGroups"),
                detail: t(locale, "projectsLinkDetail"),
                ownerPrefix: t(locale, "projectsOwnerPrefix"),
                metaRelations: t(locale, "projectsMetaRelations"),
                metaKnowledge: t(locale, "projectsMetaKnowledge"),
                selectAriaLabel: t(locale, "projectsSelectAria"),
              }}
            />
          </form>
        </div>
      ) : (
        <div className="grid gap-3">
          {visible.length ? (
            <form action={softDeleteProjectsBulkAction} className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "projectsBulkTrashHint")}</p>
                <FormSubmitButton
                  type="submit"
                  variant="secondary"
                  className="h-8 border border-rose-600/20 bg-rose-600/5 px-2.5 text-xs font-medium text-rose-700 dark:text-rose-300"
                  pendingLabel="…"
                  disabled={!selectableProjectIds.length}
                >
                  {t(locale, "projectsBulkTrashButton")}
                </FormSubmitButton>
              </div>
              {activeVisible.map(renderProjectCard)}
              {completedVisible.length ? (
                <details className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
                  <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
                    {tProjectStatus(locale, "COMPLETED")} ({completedVisible.length})
                  </summary>
                  <div className="grid gap-3 border-t border-[hsl(var(--border))] p-3">{completedVisible.map(renderProjectCard)}</div>
                </details>
              ) : null}
            </form>
          ) : (
            <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "projectsFilteredEmpty")}</p>
          )}
        </div>
      )}
    </div>
  );
}
