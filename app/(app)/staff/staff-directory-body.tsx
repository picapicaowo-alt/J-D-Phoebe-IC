import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Input } from "@/components/ui/input";
import { getLocale, type Locale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { StaffDirectoryRows } from "@/components/staff-directory-rows";

const ACTIVE_PROJECT_STATUSES = ["PLANNING", "ACTIVE", "AT_RISK", "ON_HOLD"] as const;

function onboardingBadgeText(rows: { completedAt: Date | null }[], locale: Locale): { label: string; tone: "done" | "pending" | "none" } {
  if (!rows.length) return { label: t(locale, "staffOnboardingNone"), tone: "none" };
  if (rows.every((r) => r.completedAt)) return { label: t(locale, "staffOnboardingComplete"), tone: "done" };
  return { label: t(locale, "staffOnboardingPending"), tone: "pending" };
}

function formatOnboardingTimestamp(when: Date) {
  return when.toISOString().slice(0, 16).replace("T", " ");
}

function IconPeople({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export async function StaffDirectoryBody({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; companyId?: string; departmentId?: string; active?: string }>;
}) {
  const user = (await requireUser()) as AccessUser;
  const locale = await getLocale();
  if (!(await userHasPermission(user, "staff.read"))) redirect("/projects");

  const sp = await searchParams;
  const q = String(sp.q ?? "").trim();
  const companyFilter = String(sp.companyId ?? "").trim();
  const departmentFilterRaw = String(sp.departmentId ?? "").trim();
  const activeRaw = String(sp.active ?? "all").trim().toLowerCase();

  const canCreate =
    (await userHasPermission(user, "staff.create")) &&
    (user.isSuperAdmin || user.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN"));
  const showOnboardingTimeline = user.isSuperAdmin;

  const where: Prisma.UserWhereInput = { deletedAt: null };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
    ];
  }
  if (companyFilter) {
    where.companyMemberships = { some: { companyId: companyFilter } };
  }
  let departmentFilter = "";
  if (departmentFilterRaw) {
    const dep = await prisma.department.findFirst({
      where: {
        id: departmentFilterRaw,
        ...(companyFilter ? { companyId: companyFilter } : {}),
      },
    });
    if (dep) departmentFilter = dep.id;
  }
  if (departmentFilter) {
    where.companyMemberships = {
      some: {
        departmentId: departmentFilter,
        ...(companyFilter ? { companyId: companyFilter } : {}),
      },
    };
  }
  if (activeRaw === "active") where.active = true;
  else if (activeRaw === "inactive") where.active = false;

  const [staff, totalAll, companies] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        companyMemberships: { include: { company: true, roleDefinition: true, department: true } },
        memberOnboardings: { select: { completedAt: true, companyId: true, company: { select: { name: true } } } },
        projectMemberships: {
          where: {
            project: {
              deletedAt: null,
              status: { in: [...ACTIVE_PROJECT_STATUSES] },
            },
          },
        },
      },
    }),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.company.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
  ]);

  const departmentOptions = await prisma.department.findMany({
    where: {
      company: { deletedAt: null },
      ...(companyFilter ? { companyId: companyFilter } : {}),
    },
    include: { company: true },
    orderBy: [{ company: { name: "asc" } }, { sortOrder: "asc" }],
    take: 200,
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10 text-[hsl(var(--foreground))]">
            <IconPeople />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">{t(locale, "staffDirectoryTitle")}</h1>
            <p className="mt-1 max-w-2xl text-sm text-[hsl(var(--muted))]">{t(locale, "staffDirectorySubtitle")}</p>
          </div>
        </div>
        {canCreate ? (
          <Link href="/staff/new">
            <Button type="button" className="rounded-[10px] px-5">
              {t(locale, "staffAddMemberBtn")}
            </Button>
          </Link>
        ) : null}
      </div>

      <div className="space-y-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10 p-4">
        <form action="/staff" method="get" className="space-y-3">
          <Input name="q" defaultValue={q} placeholder={t(locale, "staffSearchPh")} className="h-11 rounded-[10px] border-[hsl(var(--border))] bg-[hsl(var(--card))] text-sm shadow-sm" />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "staffFilterCompany")}</label>
              <select
                name="companyId"
                defaultValue={companyFilter}
                className="h-10 w-full rounded-[10px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm"
              >
                <option value="">{t(locale, "kbAllCompanies")}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "staffFilterDepartment")}</label>
              <select
                name="departmentId"
                defaultValue={departmentFilter}
                className="h-10 w-full rounded-[10px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm"
              >
                <option value="">{t(locale, "staffFilterAnyDepartment")}</option>
                {departmentOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.company.name} / {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "staffFilterStatus")}</label>
              <select
                name="active"
                defaultValue={activeRaw === "active" || activeRaw === "inactive" ? activeRaw : "all"}
                className="h-10 w-full rounded-[10px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm"
              >
                <option value="all">{t(locale, "staffFilterStatusAll")}</option>
                <option value="active">{t(locale, "staffStatusActive")}</option>
                <option value="inactive">{t(locale, "staffStatusInactive")}</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <FormSubmitButton type="submit" variant="secondary" className="h-9 rounded-[10px]" pendingLabel={t(locale, "btnApply")}>
              {t(locale, "btnApply")}
            </FormSubmitButton>
            <Link href="/staff" className="inline-flex h-9 items-center text-sm text-[hsl(var(--muted))] underline">
              {t(locale, "btnReset")}
            </Link>
          </div>
        </form>
      </div>

      <p className="text-sm text-[hsl(var(--muted))]">
        {t(locale, "staffShowingCounts").replace("{x}", String(staff.length)).replace("{y}", String(totalAll))}
      </p>

      <StaffDirectoryRows
        rows={staff.map((s) => ({
          id: s.id,
          name: s.name,
          email: s.email,
          title: s.title,
          avatarUrl: s.avatarUrl,
          active: s.active,
          isSuperAdmin: s.isSuperAdmin,
          activeProjectCount: s.projectMemberships.length,
          onboarding: onboardingBadgeText(s.memberOnboardings, locale),
          onboardingTimeline: showOnboardingTimeline
            ? [...s.memberOnboardings]
                .sort((a, b) => a.company.name.localeCompare(b.company.name))
                .map((ob) => ({
                  key: `${ob.companyId}:${ob.completedAt?.toISOString() ?? "pending"}`,
                  label: ob.completedAt
                    ? `${ob.company.name} · ${t(locale, "onboardingCompletedAtLabel")}: ${formatOnboardingTimestamp(ob.completedAt)}`
                    : `${ob.company.name} · ${t(locale, "staffOnboardingPending")}`,
                }))
            : [],
          companies: s.companyMemberships.map((m) => ({
            key: m.id,
            label: `${m.company.name}${m.department ? ` · ${m.department.name}` : ""}`,
          })),
          contactLine: [s.contactEmails, s.phone].filter(Boolean).join(" · ").trim() || null,
        }))}
        copy={{
          active: t(locale, "staffStatusActive"),
          inactive: t(locale, "staffStatusInactive"),
          superAdmin: t(locale, "superAdminBadge"),
          activeProjectsTpl: t(locale, "staffActiveProjectsCount"),
          emDash: t(locale, "staffListEmDash"),
          selectAll: t(locale, "staffCheckboxSelectAll"),
          clear: t(locale, "staffCheckboxClear"),
          selectedTpl: t(locale, "staffCheckboxSelected"),
        }}
      />
    </div>
  );
}
