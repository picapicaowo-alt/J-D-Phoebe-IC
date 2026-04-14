import Link from "next/link";
import { redirect } from "next/navigation";
import type { LeaderboardCategory } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { userHasPermission } from "@/lib/permissions";
import type { AccessUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getLocale } from "@/lib/locale";
import { t, type MessageKey } from "@/lib/messages";
import { leaderboardTotals, type LeaderboardScope } from "@/lib/leaderboard-query";

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
    EXECUTION: "lbExecution",
    COLLABORATION: "lbCollaboration",
    KNOWLEDGE: "lbKnowledge",
    RECOGNITION: "lbRecognition",
  };
  return t(locale, key[c]);
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
    where: { id: { in: totals.map((r) => r.userId) }, deletedAt: null },
    select: { id: true, name: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.name]));

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t(locale, "navLeaderboards")}</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted))]">
          Category boards with period and scope filters. Home stays personal — no rank pressure on first screen.
        </p>
      </div>

      <Card className="space-y-3 p-4">
        <CardTitle>Filters</CardTitle>
        <div className="flex flex-wrap gap-2 text-sm">
          {CATS.map((c) => (
            <Link key={c} href={`/leaderboard${qs({ cat: c })}`}>
              <Button type="button" variant={c === cat ? "primary" : "secondary"} className="h-8 text-xs">
                {catTitle(locale, c)}
              </Button>
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap gap-2 text-sm" method="get">
          <input type="hidden" name="cat" value={cat} />
          <select name="period" defaultValue={period} className="h-9 rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-xs">
            <option value="weekly">{t(locale, "periodWeekly")}</option>
            <option value="monthly">{t(locale, "periodMonthly")}</option>
          </select>
          <select name="scope" defaultValue={scope} className="h-9 rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-xs">
            <option value="ALL">{t(locale, "scopeAll")}</option>
            <option value="COMPANY">{t(locale, "scopeCompany")}</option>
            <option value="PROJECT">{t(locale, "scopeProject")}</option>
            <option value="ROLE">{t(locale, "scopeRole")}</option>
          </select>
          <select name="companyId" defaultValue={companyId ?? ""} className="h-9 min-w-[160px] rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-xs">
            <option value="">— {t(locale, "scopeCompany")}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select name="projectId" defaultValue={projectId ?? ""} className="h-9 min-w-[180px] rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-xs">
            <option value="">— {t(locale, "scopeProject")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.company.name} / {p.name}</option>
            ))}
          </select>
          <select name="roleKey" defaultValue={roleKey ?? ""} className="h-9 min-w-[160px] rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-xs">
            <option value="">— {t(locale, "scopeRole")}</option>
            {roles.map((r) => (
              <option key={r.id} value={r.key}>{r.displayName}</option>
            ))}
          </select>
          <Button type="submit" variant="secondary" className="h-9 text-xs">
            Apply
          </Button>
          <Link className="self-center text-xs underline" href="/leaderboard">
            Reset
          </Link>
        </form>
      </Card>

      <Card className="space-y-3 p-4">
        <CardTitle>{catTitle(locale, cat)}</CardTitle>
        <p className="text-xs text-[hsl(var(--muted))]">
          Period {periodStart.toISOString().slice(0, 10)} – {new Date(periodEnd.getTime() - 1).toISOString().slice(0, 10)} · Scores sum structured ledger entries.
        </p>
        <ol className="space-y-2 text-sm">
          {totals.length ? (
            totals.map((row, i) => (
              <li key={row.userId} className="flex items-center justify-between rounded-md border border-[hsl(var(--border))] px-3 py-2">
                <span>
                  <span className="text-[hsl(var(--muted))]">{i + 1}.</span> {nameById.get(row.userId) ?? row.userId}
                </span>
                <span className="text-xs text-[hsl(var(--muted))]">{row.total} pts</span>
              </li>
            ))
          ) : (
            <li className="text-sm text-[hsl(var(--muted))]">No entries in this window yet.</li>
          )}
        </ol>
      </Card>
    </div>
  );
}
