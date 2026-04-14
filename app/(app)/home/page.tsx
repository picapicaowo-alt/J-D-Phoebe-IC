import Link from "next/link";
import { redirect } from "next/navigation";
import type { LeaderboardCategory } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { canViewProject, type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card, CardTitle } from "@/components/ui/card";
import { countdownPhrase } from "@/lib/deadlines";
import { getLocale } from "@/lib/locale";
import { displayRecognitionSecondary } from "@/lib/recognition-catalog";
import { getCompanionManifest } from "@/lib/companion-manifest";
import { t, tProjectStatus, tRecognitionTagCategory, type MessageKey } from "@/lib/messages";

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

export default async function HomePage() {
  const user = (await requireUser()) as AccessUser;
  if (!user.companionIntroCompletedAt) redirect("/onboarding/companion");
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
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{t(locale, "homeTitle")}</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{t(locale, "homeSubtitle")}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-4 border-zinc-200/90 p-5 lg:col-span-2">
          <CardTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{t(locale, "homePriorities")}</CardTitle>
          {priorities.length ? (
            <ul className="space-y-4">
              {priorities.map((p) => {
                const pct = Math.max(0, Math.min(100, p.progressPercent));
                return (
                  <li key={p.id} className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link className="text-base font-semibold text-zinc-900 hover:underline dark:text-zinc-50" href={`/projects/${p.id}`}>
                          {p.name}
                        </Link>
                        <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{p.company.name}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-zinc-200/90 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {tProjectStatus(locale, p.status)}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-zinc-500 sm:grid-cols-2 dark:text-zinc-400">
                      <div>
                        {t(locale, "homeOwner")} {p.owner.name}
                      </div>
                      <div className="sm:text-right">{countdownPhrase(p.deadline)}</div>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                        <div className="h-2.5 rounded-full bg-zinc-900 dark:bg-zinc-100" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">{pct}%</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{t(locale, "homeNoPriorities")}</p>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="space-y-3 border-zinc-200/90 p-5">
            <CardTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{t(locale, "homeExecutionSnapshot")}</CardTitle>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  {t(locale, "homeBlockedNodes")}
                </span>
                <span className="text-lg font-semibold text-rose-600 dark:text-rose-400">{blockedCount}</span>
              </li>
              <li className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  {t(locale, "homeWaitingApprovals")}
                </span>
                <span className="text-lg font-semibold text-amber-600 dark:text-amber-400">{waitingApprovalCount}</span>
              </li>
              <li className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                  <span className="h-2 w-2 rounded-full bg-sky-500" />
                  {t(locale, "homeDue7d")}
                </span>
                <span className="text-lg font-semibold text-sky-600 dark:text-sky-400">{dueSoonCount}</span>
              </li>
              <li className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <span className="text-zinc-600 dark:text-zinc-400">{t(locale, "homeOpenProjects")}</span>
                <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{visible.length}</span>
              </li>
            </ul>
          </Card>

          <Card className="space-y-3 border-zinc-200/90 p-5">
            <CardTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{t(locale, "homeOneGoodThing")}</CardTitle>
            {latestRec ? (
              <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4 text-sm dark:border-violet-900/40 dark:bg-violet-950/20">
                <div className="font-medium text-zinc-900 dark:text-zinc-100">
                  {latestRec.secondaryLabelKey
                    ? displayRecognitionSecondary(latestRec.tagCategory, latestRec.secondaryLabelKey, locale)
                    : (latestRec.tagLabel ?? "")}
                </div>
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {tRecognitionTagCategory(locale, latestRec.tagCategory)} · {latestRec.project?.name ?? t(locale, "kbGeneralProject")}
                </div>
                <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{latestRec.message ?? t(locale, "homeRecognizedDefault")}</p>
                <div className="mt-2 text-xs text-zinc-400">{t(locale, "homeFrom")} {latestRec.fromUser?.name ?? "—"}</div>
              </div>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{t(locale, "homeNoRecognition")}</p>
            )}
            {companion ? (
              <div className="flex items-center gap-3 rounded-xl border border-zinc-100 p-3 dark:border-zinc-800">
                {(() => {
                  const asset = getCompanionManifest().find((e) => e.species === companion.species);
                  return asset ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.file} alt="" width={48} height={48} className="h-12 w-12 rounded-2xl object-contain" />
                  ) : null;
                })()}
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {t(locale, "homeCompanionLine")}: {companion.name ?? (locale === "zh" ? "小伙伴" : "Companion")} · {t(locale, "homeMood")}{" "}
                  {companion.mood} · {t(locale, "homeLevel")} {companion.level}
                </p>
              </div>
            ) : null}
          </Card>
        </div>

        <Card className="space-y-4 border-zinc-200/90 p-5 lg:col-span-3">
          <CardTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{t(locale, "scorePreview")}</CardTitle>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{t(locale, "homeScoreHint")}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {scoreRows.map((row) => (
              <div key={row.c} className="rounded-xl border border-zinc-100 p-4 text-center dark:border-zinc-800">
                <div className={`text-3xl font-bold tabular-nums ${LB_COLOR[row.c]}`}>{row.cur}</div>
                <div className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">{t(locale, LB_LABEL[row.c])}</div>
                <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
                  {row.delta >= 0 ? "▲" : "▼"} {row.delta >= 0 ? "+" : ""}
                  {row.delta} {t(locale, "homeVsPrior")}
                </div>
              </div>
            ))}
          </div>
          {latestSnapshot ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {t(locale, "homeSnapshotRef")}: E {latestSnapshot.executionScore} · C {latestSnapshot.collaborationScore} · K{" "}
              {latestSnapshot.knowledgeScore} · R {latestSnapshot.recognitionScore}
            </p>
          ) : null}
          <Link className="inline-block text-sm font-medium text-zinc-900 underline underline-offset-4 dark:text-white" href="/leaderboard">
            {t(locale, "homeOpenLb")}
          </Link>
        </Card>
      </div>
    </div>
  );
}
