import Link from "next/link";
import type { LeaderboardCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AccessUser } from "@/lib/access";
import { Card, CardTitle } from "@/components/ui/card";
import { getLocale } from "@/lib/locale";
import { t, type MessageKey } from "@/lib/messages";

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

async function ledgerSumByCategory(userId: string, start: Date, end: Date): Promise<Map<LeaderboardCategory, number>> {
  const rows = await prisma.scoreLedgerEntry.groupBy({
    by: ["leaderboardCategory"],
    where: { userId, createdAt: { gte: start, lt: end } },
    _sum: { delta: true },
  });
  const m = new Map<LeaderboardCategory, number>();
  for (const r of rows) {
    m.set(r.leaderboardCategory, r._sum.delta ?? 0);
  }
  return m;
}

const LB_LABEL: Record<LeaderboardCategory, MessageKey> = {
  EXECUTION: "lbExecution",
  COLLABORATION: "lbCollaboration",
  KNOWLEDGE: "lbKnowledge",
  RECOGNITION: "lbRecognition",
};

const LB_COLOR: Record<LeaderboardCategory, string> = {
  EXECUTION: "text-sky-600 dark:text-sky-400",
  COLLABORATION: "text-emerald-600 dark:text-emerald-400",
  KNOWLEDGE: "text-violet-600 dark:text-violet-400",
  RECOGNITION: "text-amber-600 dark:text-amber-400",
};

export async function HomeScoreSection({ user }: { user: AccessUser }) {
  const locale = await getLocale();
  const weekStart = startOfWeekUTC();
  const weekEnd = addDaysUTC(weekStart, 7);
  const prevWeekStart = addDaysUTC(weekStart, -7);
  const cats: LeaderboardCategory[] = ["EXECUTION", "COLLABORATION", "KNOWLEDGE", "RECOGNITION"];

  const [curWeekSums, prevWeekSums, latestSnapshot] = await Promise.all([
    ledgerSumByCategory(user.id, weekStart, weekEnd),
    ledgerSumByCategory(user.id, prevWeekStart, weekStart),
    prisma.performanceSnapshot.findFirst({
      where: { userId: user.id, weekStart },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const scoreRows = cats.map((c) => {
    const cur = curWeekSums.get(c) ?? 0;
    const prev = prevWeekSums.get(c) ?? 0;
    return { c, cur, delta: cur - prev };
  });

  return (
    <Card className="space-y-4 border-zinc-200/90 p-5 lg:col-span-3">
      <CardTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{t(locale, "scorePreview")}</CardTitle>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{t(locale, "homeScoreHint")}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {scoreRows.map((row) => (
          <div key={row.c} className="rounded-xl border border-zinc-100 p-4 text-center dark:border-zinc-800">
            <div className={`text-3xl font-bold tabular-nums ${LB_COLOR[row.c]}`}>{row.cur}</div>
            <div className="mt-1 text-sm font-medium text-zinc-500 dark:text-zinc-400">{t(locale, LB_LABEL[row.c])}</div>
            <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              {row.delta >= 0 ? "▲" : "▼"} {row.delta >= 0 ? "+" : ""}
              {row.delta} {t(locale, "homeVsPrior")}
            </div>
          </div>
        ))}
      </div>
      {latestSnapshot ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {t(locale, "homeSnapshotRef")}: E {latestSnapshot.executionScore} · C {latestSnapshot.collaborationScore} · K{" "}
          {latestSnapshot.knowledgeScore} · R {latestSnapshot.recognitionScore}
        </p>
      ) : null}
      <Link className="inline-block text-base font-medium text-zinc-900 underline underline-offset-4 dark:text-white" href="/leaderboard">
        {t(locale, "homeOpenLb")}
      </Link>
    </Card>
  );
}
