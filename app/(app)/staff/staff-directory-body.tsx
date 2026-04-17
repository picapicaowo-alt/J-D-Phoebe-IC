import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { companyVisibilityWhere, staffVisibilityWhere, type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { getLocale, type Locale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { StaffDirectoryRows } from "@/components/staff-directory-rows";
import { StaffDirectoryFilters } from "@/components/staff-directory-filters";

const ACTIVE_PROJECT_STATUSES = ["PLANNING", "ACTIVE", "AT_RISK", "ON_HOLD"] as const;

function isMissingColumnError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022";
}

function readOptionalString(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object" || !(key in obj)) return null;
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

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
  const companyFilterRaw = String(sp.companyId ?? "").trim();
  const departmentFilterRaw = String(sp.departmentId ?? "").trim();
  const activeRaw = String(sp.active ?? "all").trim().toLowerCase();
  const activeFilter = activeRaw === "active" || activeRaw === "inactive" ? activeRaw : "all";

  const canCreate =
    (await userHasPermission(user, "staff.create")) &&
    (user.isSuperAdmin || user.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN"));
  const showOnboardingTimeline = user.isSuperAdmin;
  const visibleCompanyWhere: Prisma.CompanyWhereInput = { deletedAt: null, ...companyVisibilityWhere(user) };

  const companies = await prisma.company.findMany({
    where: visibleCompanyWhere,
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const companyFilter = companyFilterRaw && companies.some((company) => company.id === companyFilterRaw) ? companyFilterRaw : "";
  const visibleCompanyIds = companies.map((company) => company.id);

  const whereClauses: Prisma.UserWhereInput[] = [{ deletedAt: null }, staffVisibilityWhere(user)];
  if (q) {
      whereClauses.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { title: { contains: q, mode: "insensitive" } },
          { signature: { contains: q, mode: "insensitive" } },
        ],
      });
  }
  if (companyFilter) {
    whereClauses.push({ companyMemberships: { some: { companyId: companyFilter } } });
  }
  let departmentFilter = "";
  if (departmentFilterRaw) {
    const dep = await prisma.department.findFirst({
      where: {
        id: departmentFilterRaw,
        ...(companyFilter ? { companyId: companyFilter } : { companyId: { in: visibleCompanyIds } }),
      },
      select: { id: true },
    });
    if (dep) departmentFilter = dep.id;
  }
  if (departmentFilter) {
    whereClauses.push({
      companyMemberships: {
        some: {
          departmentId: departmentFilter,
          ...(companyFilter ? { companyId: companyFilter } : {}),
        },
      },
    });
  }
  if (activeFilter === "active") whereClauses.push({ active: true });
  else if (activeFilter === "inactive") whereClauses.push({ active: false });

  const where: Prisma.UserWhereInput = whereClauses.length === 1 ? whereClauses[0]! : { AND: whereClauses };
  const totalAllPromise = prisma.user.count({ where: { deletedAt: null, ...staffVisibilityWhere(user) } });

  const loadStaffAndDepartments = async () => {
    try {
      const [staffRows, departmentRows] = await Promise.all([
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
        prisma.department.findMany({
          where: { companyId: { in: visibleCompanyIds } },
          select: {
            id: true,
            name: true,
            companyId: true,
            company: { select: { name: true } },
          },
          orderBy: [{ company: { name: "asc" } }, { sortOrder: "asc" }],
          take: 200,
        }),
      ]);
      return { staffRows, departmentRows };
    } catch (error) {
      if (!isMissingColumnError(error)) throw error;
      console.warn("[staff] falling back to legacy-compatible query after missing-column error", error);

      const [staffRows, departmentRows] = await Promise.all([
        prisma.user.findMany({
          where,
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            email: true,
            title: true,
            avatarUrl: true,
            active: true,
            isSuperAdmin: true,
            companyMemberships: { include: { company: true, roleDefinition: true, department: true } },
            memberOnboardings: { select: { completedAt: true, companyId: true, company: { select: { name: true } } } },
            projectMemberships: {
              where: {
                project: {
                  deletedAt: null,
                  status: { in: [...ACTIVE_PROJECT_STATUSES] },
                },
              },
              select: { id: true },
            },
          },
        }),
        prisma.department.findMany({
          where: { companyId: { in: visibleCompanyIds } },
          select: {
            id: true,
            name: true,
            companyId: true,
            company: { select: { name: true } },
          },
          orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
          take: 200,
        }),
      ]);
      return { staffRows, departmentRows };
    }
  };

  const [{ staffRows: staff, departmentRows: departmentOptions }, totalAll] = await Promise.all([
    loadStaffAndDepartments(),
    totalAllPromise,
  ]);

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

      <StaffDirectoryFilters
        key={`${q}|${companyFilter}|${departmentFilter}|${activeFilter}`}
        q={q}
        companyId={companyFilter}
        departmentId={departmentFilter}
        active={activeFilter}
        companies={companies}
        departments={departmentOptions.map((department) => ({
          id: department.id,
          name: department.name,
          companyId: department.companyId,
          companyName: department.company.name,
        }))}
        labels={{
          searchPlaceholder: t(locale, "staffSearchPh"),
          company: t(locale, "staffFilterCompany"),
          allCompanies: t(locale, "kbAllCompanies"),
          department: t(locale, "staffFilterDepartment"),
          anyDepartment: t(locale, "staffFilterAnyDepartment"),
          status: t(locale, "staffFilterStatus"),
          allStatus: t(locale, "staffFilterStatusAll"),
          active: t(locale, "staffStatusActive"),
          inactive: t(locale, "staffStatusInactive"),
          apply: t(locale, "btnApply"),
          reset: t(locale, "btnReset"),
        }}
      />

      <p className="text-sm text-[hsl(var(--muted))]">
        {t(locale, "staffShowingCounts").replace("{x}", String(staff.length)).replace("{y}", String(totalAll))}
      </p>

      <StaffDirectoryRows
        rows={staff.map((s) => ({
          id: s.id,
          name: s.name,
          email: s.email,
          title: s.title,
          signature: readOptionalString(s, "signature"),
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
          contactLine: [readOptionalString(s, "contactEmails"), readOptionalString(s, "phone")].filter(Boolean).join(" · ").trim() || null,
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
