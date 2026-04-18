import Link from "next/link";
import { redirect } from "next/navigation";
import type { LeaderboardCategory } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { userHasPermission } from "@/lib/permissions";
import type { AccessUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { Card, CardTitle } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/form-submit-button";
import { UserFace } from "@/components/user-face";
import { getLocale } from "@/lib/locale";
import { t, type MessageKey } from "@/lib/messages";
import { leaderboardTotals, type LeaderboardScope } from "@/lib/leaderboard-query";
import { DEMO_SUPERADMIN_EMAILS } from "@/lib/demo-superadmins";

function startOfWeekUTC(ref = new Date()) {
  const d = new Date(ref);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

function startOfMonthUTC(ref = new Date()) {
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
}

function addDaysUTC(d: Date, days: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

const CATS: LeaderboardCategory[] = ["EXECUTION", "COLLABORATION", "KNOWLEDGE", "RECOGNITION"];

function catTitle(locale: "en" | "zh", c: LeaderboardCategory): string {
  const key: Record<LeaderboardCategory, MessageKey> = {
    EXECUTION: "lbTabExecution",
    COLLABORATION: "lbTabCollaboration",
    KNOWLEDGE: "lbTabKnowledge",
    RECOGNITION: "lbTabRecognition",
  };
  return t(locale, key[c]);
}

const CAT_SCORE: Record<LeaderboardCategory, string> = {
  EXECUTION: "text-sky-600 dark:text-sky-400",
  COLLABORATION: "text-emerald-600 dark:text-emerald-400",
  KNOWLEDGE: "text-violet-600 dark:text-violet-400",
  RECOGNITION: "text-amber-600 dark:text-amber-400",
};

function CatTabIcon({ cat }: { cat: LeaderboardCategory }) {
  if (cat === "EXECUTION") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden>
        <path d="M4 19h16M5 15l4-8 4 5 4-9 3 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (cat === "COLLABORATION") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden>
        <path
          d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (cat === "KNOWLEDGE") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden>
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden>
      <path d="M12 15c-2.5 0-4.5-2-4.5-4.5V6l4.5-3 4.5 3v4.5C16.5 13 14.5 15 12 15z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 21h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function rankBadge(locale: "en" | "zh", i: number) {
  if (i === 0) return <span className="text-lg" title={t(locale, "lbRankFirst")}>👑</span>;
  if (i === 1) return <span className="text-lg" title={t(locale, "lbRankSecond")}>🥈</span>;
  if (i === 2) return <span className="text-lg" title={t(locale, "lbRankThird")}>🥉</span>;
  return <span className="w-6 text-center text-sm font-semibold text-zinc-400">{i + 1}</span>;
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    cat?: LeaderboardCategory;
    period?: "weekly" | "monthly";
    scope?: LeaderboardScope;
    companyId?: string;
    projectId?: string;
    roleKey?: string;
  }>;
}) {
  const user = (await requireUser()) as AccessUser;
  if (!(await userHasPermission(user, "leaderboard.read"))) redirect("/home");
  const locale = await getLocale();
  const sp = await searchParams;
  const cat = (sp.cat && CATS.includes(sp.cat) ? sp.cat : "EXECUTION") as LeaderboardCategory;
  const period = sp.period === "monthly" ? "monthly" : "weekly";
  const scope = (["ALL", "COMPANY", "PROJECT", "ROLE"].includes(String(sp.scope)) ? sp.scope : "ALL") as LeaderboardScope;
  const companyId = String(sp.companyId ?? "").trim() || null;
  const projectId = String(sp.projectId ?? "").trim() || null;
  const roleKey = String(sp.roleKey ?? "").trim() || null;

  let periodStart: Date;
  let periodEnd: Date;
  if (period === "weekly") {
    periodStart = startOfWeekUTC();
    periodEnd = addDaysUTC(periodStart, 7);
  } else {
    periodStart = startOfMonthUTC();
    periodEnd = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1));
  }

  const totals = await leaderboardTotals(prisma, {
    category: cat,
    periodStart,
    periodEnd,
    scope: scope === "ROLE" && !roleKey ? "ALL" : scope,
    companyId,
    projectId,
    roleKey,
  });

  const users = await prisma.user.findMany({
    where: { id: { in: totals.map((r) => r.userId) }, deletedAt: null, NOT: { email: { in: [...DEMO_SUPERADMIN_EMAILS] } } },
    select: { id: true, name: true, avatarUrl: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));
  const visibleTotals = totals.filter((row) => userById.has(row.userId));

  const companies = await prisma.company.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    include: { company: true },
    orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
    take: 80,
  });
  const roles = await prisma.roleDefinition.findMany({ orderBy: { displayName: "asc" }, take: 40 });

  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    const merged = {
      cat,
      period,
      scope,
      ...(companyId ? { companyId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(roleKey ? { roleKey } : {}),
      ...patch,
    };
    Object.entries(merged).forEach(([k, v]) => {
      if (v) p.set(k, v);
    });
    return `?${p.toString()}`;
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-3">
        <span className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2l2.2 6.8H21l-5.5 4 2.1 6.7L12 16.9 6.4 19.5l2.1-6.7L3 8.8h6.8L12 2z" />
          </svg>
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{t(locale, "lbTrophyTitle")}</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t(locale, "lbTrophySubtitle")}</p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <form className="grid gap-3 md:grid-cols-2 lg:grid-cols-4" method="get">
          <input type="hidden" name="cat" value={cat} />
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">{t(locale, "lbPeriodPrefix")}</label>
            <select name="period" defaultValue={period} className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950">
              <option value="weekly">{t(locale, "periodWeekly")}</option>
              <option value="monthly">{t(locale, "periodMonthly")}</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">{t(locale, "kbAllCompanies")}</label>
            <select name="companyId" defaultValue={companyId ?? ""} className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950">
              <option value="">{t(locale, "kbAllCompanies")}</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">{t(locale, "lbFiltersCardTitle")}</label>
            <select name="scope" defaultValue={scope} className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950">
              <option value="ALL">{t(locale, "scopeAll")}</option>
              <option value="COMPANY">{t(locale, "scopeCompany")}</option>
              <option value="PROJECT">{t(locale, "scopeProject")}</option>
              <option value="ROLE">{t(locale, "scopeRole")}</option>
            </select>
          </div>
          <div className="flex items-end gap-2 md:col-span-2 lg:col-span-1">
            <FormSubmitButton type="submit" variant="secondary" className="h-10 flex-1 rounded-lg text-xs">
              {t(locale, "btnApply")}
            </FormSubmitButton>
            <Link className="mb-2 inline-flex h-10 items-center text-xs font-medium text-zinc-500 underline" href="/leaderboard">
              {t(locale, "btnReset")}
            </Link>
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-medium text-zinc-500">{t(locale, "scopeProject")}</label>
            <select name="projectId" defaultValue={projectId ?? ""} className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950">
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.company.name} / {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-medium text-zinc-500">{t(locale, "scopeRole")}</label>
            <select name="roleKey" defaultValue={roleKey ?? ""} className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950">
              <option value="">—</option>
              {roles.map((r) => (
                <option key={r.id} value={r.key}>
                  {r.displayName}
                </option>
              ))}
            </select>
          </div>
        </form>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
        {CATS.map((c) => (
          <Link
            key={c}
            href={`/leaderboard${qs({ cat: c })}`}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
              c === cat
                ? "bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
            }`}
          >
            <CatTabIcon cat={c} />
            {catTitle(locale, c)}
          </Link>
        ))}
      </div>

      <Card className="overflow-hidden border-zinc-200/90 p-0 shadow-sm dark:border-zinc-800">
        <div className="border-b border-zinc-100 bg-zinc-50/80 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <CardTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {catTitle(locale, cat)} · {t(locale, "lbLeaderboardBoard")}
          </CardTitle>
          <p className="mt-1 text-xs text-zinc-500">
            {periodStart.toISOString().slice(0, 10)} – {new Date(periodEnd.getTime() - 1).toISOString().slice(0, 10)} · {t(locale, "lbScoresExplain")}
          </p>
        </div>
        <ol className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {visibleTotals.length ? (
            visibleTotals.map((row, i) => {
              const userRow = userById.get(row.userId);
              const nm = userRow?.name ?? row.userId;
              return (
                <li key={row.userId} className="flex items-center gap-4 px-5 py-4">
                  <div className="flex w-10 shrink-0 justify-center">{rankBadge(locale, i)}</div>
                  <UserFace name={nm} avatarUrl={userRow?.avatarUrl} size={40} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/staff/${row.userId}`} className="truncate font-semibold text-zinc-900 hover:underline dark:text-zinc-50">
                      {nm}
                    </Link>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-xl font-bold tabular-nums ${CAT_SCORE[cat]}`}>{row.total}</p>
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{t(locale, "lbPtsUnit")}</p>
                  </div>
                </li>
              );
            })
          ) : (
            <li className="px-5 py-8 text-center text-sm text-zinc-500">{t(locale, "lbEmptyPeriod")}</li>
          )}
        </ol>
      </Card>
    </div>
  );
}
