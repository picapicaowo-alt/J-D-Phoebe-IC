import Link from "next/link";
import { redirect } from "next/navigation";
import type { LeaderboardCategory } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { canViewProject, type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card, CardTitle } from "@/components/ui/card";
import { labelProjectStatus, labelRecognitionCategory } from "@/lib/labels";
import { countdownPhrase } from "@/lib/deadlines";
import { getLocale } from "@/lib/locale";
import { displayRecognitionSecondary } from "@/lib/recognition-catalog";
import { getCompanionManifest } from "@/lib/companion-manifest";

function startOfWeekUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

function addDaysUTC(d: Date, days: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

async function sumLedger(userId: string, cat: LeaderboardCategory, start: Date, end: Date) {
  const a = await prisma.scoreLedgerEntry.aggregate({
    where: { userId, leaderboardCategory: cat, createdAt: { gte: start, lt: end } },
    _sum: { delta: true },
  });
  return a._sum.delta ?? 0;
}

export default async function HomePage() {
  const user = (await requireUser()) as AccessUser;
  if (!(await userHasPermission(user, "project.read"))) redirect("/group");
  const locale = await getLocale();

  const projects = await prisma.project.findMany({
    where: { deletedAt: null, status: { not: "COMPLETED" } },
    include: { company: { include: { orgGroup: true } }, owner: true },
    orderBy: [{ deadline: "asc" }, { priority: "desc" }, { updatedAt: "desc" }],
    take: 40,
  });
  const visible = projects.filter((p) => canViewProject(user, p));
  const priorities = visible.slice(0, 3);

  const weekStart = startOfWeekUTC();
  const weekEnd = addDaysUTC(weekStart, 7);
  const prevWeekStart = addDaysUTC(weekStart, -7);
  const cats: LeaderboardCategory[] = ["EXECUTION", "COLLABORATION", "KNOWLEDGE", "RECOGNITION"];
  const scoreRows = await Promise.all(
    cats.map(async (c) => {
      const cur = await sumLedger(user.id, c, weekStart, weekEnd);
      const prev = await sumLedger(user.id, c, prevWeekStart, weekStart);
      return { c, cur, delta: cur - prev };
    }),
  );

  const [blockedCount, waitingApprovalCount, dueSoonCount, latestRec, latestSnapshot, companion] = await Promise.all([
    prisma.workflowNode.count({ where: { deletedAt: null, status: "BLOCKED", project: { deletedAt: null } } }),
    prisma.workflowNode.count({ where: { deletedAt: null, status: "WAITING", project: { deletedAt: null } } }),
    prisma.project.count({
      where: {
        deletedAt: null,
        status: { in: ["PLANNING", "ACTIVE", "AT_RISK", "ON_HOLD"] },
        deadline: { lte: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) },
      },
    }),
    prisma.recognitionEvent.findFirst({
      where: { toUserId: user.id },
      include: { project: true, fromUser: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.performanceSnapshot.findFirst({
      where: { userId: user.id, weekStart },
      orderBy: { createdAt: "desc" },
    }),
    prisma.companionProfile.findUnique({ where: { userId: user.id } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Today Dashboard</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted))]">Priority first, reward second. Keep execution clear and calm.</p>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <CardTitle>Today&apos;s Priorities</CardTitle>
          {priorities.length ? (
            <ul className="space-y-2 text-sm">
              {priorities.map((p) => (
                <li key={p.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
                  <div className="font-medium">
                    <Link className="hover:underline" href={`/projects/${p.id}`}>
                      {p.name}
                    </Link>
                  </div>
                  <div className="text-xs text-[hsl(var(--muted))]">
                    {p.company.name} · Owner {p.owner.name} · {labelProjectStatus(p.status)} · {countdownPhrase(p.deadline)}
                  </div>
                  <div className="mt-2 h-2 w-full rounded bg-black/10 dark:bg-white/10">
                    <div className="h-2 rounded bg-[hsl(var(--accent))]" style={{ width: `${Math.max(0, Math.min(100, p.progressPercent))}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[hsl(var(--muted))]">No active priorities yet.</p>
          )}
        </Card>

        <Card className="space-y-3">
          <CardTitle>Execution Snapshot</CardTitle>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md border border-[hsl(var(--border))] p-3">
              <div className="text-xs text-[hsl(var(--muted))]">Blocked nodes</div>
              <div className="text-lg font-semibold">{blockedCount}</div>
            </div>
            <div className="rounded-md border border-[hsl(var(--border))] p-3">
              <div className="text-xs text-[hsl(var(--muted))]">Waiting approvals</div>
              <div className="text-lg font-semibold">{waitingApprovalCount}</div>
            </div>
            <div className="rounded-md border border-[hsl(var(--border))] p-3">
              <div className="text-xs text-[hsl(var(--muted))]">Due in 7 days</div>
              <div className="text-lg font-semibold">{dueSoonCount}</div>
            </div>
            <div className="rounded-md border border-[hsl(var(--border))] p-3">
              <div className="text-xs text-[hsl(var(--muted))]">Open projects</div>
              <div className="text-lg font-semibold">{visible.length}</div>
            </div>
          </div>
        </Card>

        <Card className="space-y-3">
          <CardTitle>One Good Thing Today</CardTitle>
          {latestRec ? (
            <div className="rounded-md border border-[hsl(var(--border))] p-3 text-sm">
              <div className="font-medium">
                {latestRec.secondaryLabelKey
                  ? displayRecognitionSecondary(latestRec.tagCategory, latestRec.secondaryLabelKey, locale)
                  : (latestRec.tagLabel ?? "")}
              </div>
              <div className="text-xs text-[hsl(var(--muted))]">
                {labelRecognitionCategory(latestRec.tagCategory)} · {latestRec.project?.name ?? "General"}
              </div>
              <p className="mt-1 text-sm">{latestRec.message ?? "You were recognized for meaningful contribution."}</p>
              <div className="mt-1 text-xs text-[hsl(var(--muted))]">From {latestRec.fromUser?.name ?? "A teammate"}</div>
            </div>
          ) : (
            <p className="text-sm text-[hsl(var(--muted))]">No recognition yet this cycle. Keep shipping.</p>
          )}
          {companion ? (
            <div className="mt-2 flex items-center gap-3 rounded-md border border-[hsl(var(--border))] p-2">
              {(() => {
                const asset = getCompanionManifest().find((e) => e.species === companion.species);
                return asset ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asset.file} alt="" width={48} height={48} className="h-12 w-12 rounded-2xl object-contain" />
                ) : null;
              })()}
              <p className="text-xs text-[hsl(var(--muted))]">
                Companion welcome: {companion.name ?? (locale === "zh" ? "小伙伴" : "Companion")} · mood {companion.mood} · level {companion.level}
              </p>
            </div>
          ) : null}
        </Card>

        <Card className="space-y-3">
          <CardTitle>Score / Reward Preview</CardTitle>
          <div className="space-y-2 text-sm">
            <p className="text-xs text-[hsl(var(--muted))]">
              Personal signals for this week — trend compares this week to last week (ledger-based). No rank on home.
            </p>
            {scoreRows.map((row) => (
              <div key={row.c} className="flex items-center justify-between gap-2 rounded-md border border-[hsl(var(--border))] px-2 py-1 text-xs">
                <span className="font-medium">{row.c}</span>
                <span className="text-right text-[hsl(var(--muted))]">
                  {row.cur} pts
                  <span className="ml-2 text-[hsl(var(--foreground))]">
                    {row.delta >= 0 ? "▲" : "▼"} {row.delta >= 0 ? "+" : ""}
                    {row.delta} vs prior week
                  </span>
                </span>
              </div>
            ))}
            {latestSnapshot ? (
              <p className="text-xs text-[hsl(var(--muted))]">
                Snapshot reference: E {latestSnapshot.executionScore} · C {latestSnapshot.collaborationScore} · K{" "}
                {latestSnapshot.knowledgeScore} · R {latestSnapshot.recognitionScore}
              </p>
            ) : null}
            <Link className="text-xs font-medium text-[hsl(var(--accent))] underline" href="/leaderboard">
              Open category leaderboards
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
