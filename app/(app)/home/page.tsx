import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { LeaderboardCategory, Priority, ProjectStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { canViewProject, type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { Card, CardTitle } from "@/components/ui/card";
import { countdownPhrase, isOverdue } from "@/lib/deadlines";
import { getLocale } from "@/lib/locale";
import { displayRecognitionSecondary } from "@/lib/recognition-catalog";
import { getCompanionManifest } from "@/lib/companion-manifest";
import { companionPepTalkForDay } from "@/lib/companion-pep-talks";
import { t, tPriority, tProjectStatus, tRecognitionTagCategory, tWorkflowNodeStatus, type MessageKey } from "@/lib/messages";

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

const TERMINAL_PROJECT: ProjectStatus[] = ["COMPLETED", "ARCHIVED", "CANCELLED"];

function projectPriorityScore(p: { deadline: Date | null; priority: Priority; status: ProjectStatus }, nowMs: number): number {
  if (TERMINAL_PROJECT.includes(p.status)) return -1e18;
  const dl = p.deadline ? new Date(p.deadline).getTime() : Number.POSITIVE_INFINITY;
  const overdue = dl < nowMs;
  const priW = p.priority === "URGENT" ? 4 : p.priority === "HIGH" ? 3 : p.priority === "MEDIUM" ? 2 : 1;
  let s = priW * 1e18;
  if (overdue) s += 1e16;
  if (p.status === "AT_RISK") s += 1e15;
  if (Number.isFinite(dl)) s += (1e14 - dl / 100_000);
  return s;
}

function PriorityLevelIcon({ priority, locale }: { priority: Priority; locale: "en" | "zh" }) {
  const common = "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold";
  const label = tPriority(locale, priority);
  if (priority === "URGENT") {
    return (
      <span className={`${common} border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-100`} title={label}>
        !
      </span>
    );
  }
  if (priority === "HIGH") {
    return (
      <span className={`${common} border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100`} title={label}>
        H
      </span>
    );
  }
  if (priority === "MEDIUM") {
    return (
      <span className={`${common} border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200`} title={label}>
        M
      </span>
    );
  }
  return (
    <span className={`${common} border-zinc-200 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400`} title={label}>
      L
    </span>
  );
}

function priorityHealth(
  p: { deadline: Date | null; status: ProjectStatus },
  locale: "en" | "zh",
): { badge: string; badgeClass: string; dotClass: string } {
  if (TERMINAL_PROJECT.includes(p.status)) {
    return { badge: tProjectStatus(locale, p.status), badgeClass: "bg-zinc-200/90 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300", dotClass: "bg-zinc-400" };
  }
  const overdue = p.deadline && isOverdue(p.deadline);
  if (overdue) {
    return {
      badge: t(locale, "homeOverdueBadge"),
      badgeClass: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200",
      dotClass: "bg-orange-500",
    };
  }
  if (p.status === "AT_RISK") {
    return {
      badge: t(locale, "homeAtRisk"),
      badgeClass: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100",
      dotClass: "bg-amber-500",
    };
  }
  return {
    badge: t(locale, "homeOnTrack"),
    badgeClass: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    dotClass: "bg-emerald-500",
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ snapshot?: string; skipOnboarding?: string }>;
}) {
  const user = (await requireUser()) as AccessUser;
  if (!user.companionIntroCompletedAt) redirect("/onboarding/companion");
  if (!(await userHasPermission(user, "project.read"))) redirect("/group");
  const locale = await getLocale();
  const sp = await searchParams;
  const snapshot = String(sp.snapshot ?? "").trim();
  const allowSkipOnboarding = await userHasPermission(user, "lifecycle.onboarding.skip");
  const skipOnboarding = String(sp.skipOnboarding ?? "") === "1" && allowSkipOnboarding;
  if (!skipOnboarding) {
    const { ensureAllMemberOnboardingsForUser, refreshOnboardingOverdueReminders } = await import("@/lib/member-onboarding");
    await ensureAllMemberOnboardingsForUser(user.id);
    await refreshOnboardingOverdueReminders(user.id);
    const pendingOnboarding = await prisma.memberOnboarding.findFirst({
      where: { userId: user.id, completedAt: null },
      orderBy: { deadlineAt: "asc" },
    });
    if (pendingOnboarding) {
      redirect(`/onboarding/member?companyId=${pendingOnboarding.companyId}`);
    }
  }

  const [unreadAlertCount, recentUnreadAlerts] = await Promise.all([
    prisma.inAppNotification.count({ where: { userId: user.id, readAt: null } }),
    prisma.inAppNotification.findMany({
      where: { userId: user.id, readAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const projects = await prisma.project.findMany({
    where: { deletedAt: null, status: { not: "COMPLETED" } },
    include: { company: { include: { orgGroup: true } }, owner: true },
    orderBy: [{ deadline: "asc" }, { priority: "desc" }, { updatedAt: "desc" }],
    take: 60,
  });
  const visible = projects.filter((p) => canViewProject(user, p));
  const nowMs = Date.now();
  const priorities = [...visible]
    .filter((p) => !TERMINAL_PROJECT.includes(p.status))
    .sort((a, b) => projectPriorityScore(b, nowMs) - projectPriorityScore(a, nowMs))
    .slice(0, 5);

  const visibleIds = visible.map((p) => p.id);
  const projectScope = visibleIds.length ? { projectId: { in: visibleIds } } : { projectId: { in: ["__none__"] } };
  const projectRowScope = visibleIds.length ? { id: { in: visibleIds } } : { id: { in: ["__none__"] } };

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

  const dueSoonWhere = {
    deletedAt: null,
    ...projectRowScope,
    status: { in: ["PLANNING", "ACTIVE", "AT_RISK", "ON_HOLD"] as ProjectStatus[] },
    deadline: { lte: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), not: null },
  };

  const [
    blockedCount,
    waitingCount,
    approvalCount,
    dueSoonCount,
    latestRec,
    latestSnapshot,
    companion,
    blockedRows,
    waitingRows,
    approvalRows,
    dueRows,
  ] = await Promise.all([
    prisma.workflowNode.count({ where: { deletedAt: null, status: "BLOCKED", ...projectScope } }),
    prisma.workflowNode.count({
      where: {
        deletedAt: null,
        status: "WAITING",
        nodeType: { not: "APPROVAL" },
        ...projectScope,
      },
    }),
    prisma.workflowNode.count({
      where: {
        deletedAt: null,
        nodeType: "APPROVAL",
        status: { notIn: ["DONE", "SKIPPED", "APPROVED"] },
        ...projectScope,
      },
    }),
    prisma.project.count({ where: dueSoonWhere }),
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
    snapshot === "blocked"
      ? prisma.workflowNode.findMany({
          where: { deletedAt: null, status: "BLOCKED", ...projectScope },
          include: { project: { select: { id: true, name: true } } },
          orderBy: { updatedAt: "desc" },
          take: 40,
        })
      : Promise.resolve([]),
    snapshot === "waiting"
      ? prisma.workflowNode.findMany({
          where: { deletedAt: null, status: "WAITING", nodeType: { not: "APPROVAL" }, ...projectScope },
          include: { project: { select: { id: true, name: true } } },
          orderBy: { updatedAt: "desc" },
          take: 40,
        })
      : Promise.resolve([]),
    snapshot === "approvals"
      ? prisma.workflowNode.findMany({
          where: {
            deletedAt: null,
            nodeType: "APPROVAL",
            status: { notIn: ["DONE", "SKIPPED", "APPROVED"] },
            ...projectScope,
          },
          include: { project: { select: { id: true, name: true } } },
          orderBy: { updatedAt: "desc" },
          take: 40,
        })
      : Promise.resolve([]),
    snapshot === "due"
      ? prisma.project.findMany({
          where: dueSoonWhere,
          include: { company: true, owner: true },
          orderBy: { deadline: "asc" },
          take: 30,
        })
      : Promise.resolve([]),
  ]);

  const snapTitle =
    snapshot === "blocked"
      ? t(locale, "homeSnapshotBlockedTitle")
      : snapshot === "waiting"
        ? t(locale, "homeSnapshotWaitingTitle")
        : snapshot === "approvals"
          ? t(locale, "homeSnapshotApprovalsTitle")
          : snapshot === "due"
            ? t(locale, "homeSnapshotDueTitle")
            : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{t(locale, "homeTitle")}</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{t(locale, "homeSubtitle")}</p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">{t(locale, "homePhilosophy")}</p>
      </div>

      <Card className="border-zinc-200/90 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{t(locale, "homeAlertsTitle")}</CardTitle>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t(locale, "homeAlertsLead")}</p>
          </div>
          <Link
            href="/me/notifications"
            className="shrink-0 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
          >
            {unreadAlertCount ? `${t(locale, "homeAlertsOpen")} (${unreadAlertCount})` : t(locale, "homeAlertsOpen")}
          </Link>
        </div>
        {recentUnreadAlerts.length ? (
          <ul className="mt-3 space-y-2 border-t border-zinc-200/80 pt-3 dark:border-zinc-800">
            {recentUnreadAlerts.map((n) => (
              <li key={n.id} className="text-sm text-zinc-800 dark:text-zinc-200">
                {n.href ? (
                  <Link href={n.href} className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-50">
                    {n.title}
                  </Link>
                ) : (
                  <span className="font-medium">{n.title}</span>
                )}
                {n.body ? <p className="mt-0.5 text-sm leading-snug text-zinc-600 dark:text-zinc-400">{n.body}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">{t(locale, "homeAlertsEmpty")}</p>
        )}
      </Card>

      {snapTitle ? (
        <Card className="space-y-3 border-zinc-200/90 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{snapTitle}</CardTitle>
            <Link href="/home" className="text-sm font-medium text-zinc-600 underline underline-offset-4 dark:text-zinc-300">
              {t(locale, "btnReset")}
            </Link>
          </div>
          {snapshot === "due" ? (
            dueRows.length ? (
              <ul className="space-y-2 text-sm">
                {dueRows.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800">
                    <Link href={`/projects/${p.id}`} className="font-medium text-zinc-900 hover:underline dark:text-zinc-50">
                      {p.name}
                    </Link>
                    <span className="text-sm text-zinc-500">
                      {p.company.name} · {countdownPhrase(p.deadline)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500">{t(locale, "homeSnapshotEmpty")}</p>
            )
          ) : snapshot === "blocked" || snapshot === "waiting" || snapshot === "approvals" ? (
            (() => {
              const rows = snapshot === "blocked" ? blockedRows : snapshot === "waiting" ? waitingRows : approvalRows;
              return rows.length ? (
                <ul className="space-y-2 text-sm">
                  {rows.map((n) => (
                    <li key={n.id} className="rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800">
                      <div className="font-medium text-zinc-900 dark:text-zinc-50">{n.title}</div>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-zinc-500">
                        <Link className="hover:underline" href={`/projects/${n.projectId}`}>
                          {n.project.name}
                        </Link>
                        <span>{tWorkflowNodeStatus(locale, n.status)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">{t(locale, "homeSnapshotEmpty")}</p>
              );
            })()
          ) : null}
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-4 border-zinc-200/90 p-5 lg:col-span-2">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-amber-500" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7L12 17.8 5.7 21l2.3-7-6-4.6h7.6L12 2z" />
              </svg>
            </span>
            <div>
              <CardTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{t(locale, "homePriorities")}</CardTitle>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{t(locale, "homePrioritiesHint")}</p>
            </div>
          </div>
          {priorities.length ? (
            <ul className="space-y-4">
              {priorities.map((p) => {
                const pct = Math.max(0, Math.min(100, p.progressPercent));
                const health = priorityHealth(p, locale);
                const activeLabel =
                  p.status === "ACTIVE" ? tWorkflowNodeStatus(locale, "IN_PROGRESS") : tProjectStatus(locale, p.status);
                return (
                  <li key={p.id} className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-start gap-2">
                        <PriorityLevelIcon priority={p.priority} locale={locale} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link className="text-base font-semibold text-zinc-900 hover:underline dark:text-zinc-50" href={`/projects/${p.id}`}>
                              {p.name}
                            </Link>
                            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                              {tPriority(locale, p.priority)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{p.company.name}</p>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${health.badgeClass}`}>{health.badge}</span>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-zinc-500 sm:grid-cols-2 dark:text-zinc-400">
                      <div>
                        {t(locale, "homeOwner")} {p.owner.name}
                      </div>
                      <div className="sm:text-right">{countdownPhrase(p.deadline)}</div>
                      <div>
                        {t(locale, "homeStageLabel")}: {tProjectStatus(locale, p.status)}
                      </div>
                      <div className="flex items-center justify-end gap-1.5 sm:justify-end">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${health.dotClass}`} aria-hidden />
                        <span>{activeLabel}</span>
                      </div>
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
              <li>
                <Link
                  href="/home?snapshot=blocked"
                  className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50"
                >
                  <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </span>
                    {t(locale, "homeBlockedNodes")}
                  </span>
                  <span className="text-lg font-semibold text-rose-600 dark:text-rose-400">{blockedCount}</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/home?snapshot=waiting"
                  className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50"
                >
                  <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </span>
                    {t(locale, "homeWaitingList")}
                  </span>
                  <span className="text-lg font-semibold text-amber-600 dark:text-amber-400">{waitingCount}</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/home?snapshot=approvals"
                  className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50"
                >
                  <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-200">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    </span>
                    {t(locale, "homeApprovalsNeeded")}
                  </span>
                  <span className="text-lg font-semibold text-sky-600 dark:text-sky-400">{approvalCount}</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/home?snapshot=due"
                  className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50"
                >
                  <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-200">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M12 8v4l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </span>
                    {t(locale, "homeNearDeadline")}
                  </span>
                  <span className="text-lg font-semibold text-orange-600 dark:text-orange-400">{dueSoonCount}</span>
                </Link>
              </li>
            </ul>
          </Card>

          <Card className="space-y-3 border-zinc-200/90 p-5">
            <div className="flex items-center gap-2">
              <span className="text-amber-500" aria-hidden>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 5c-2 3-6 4-6 9a6 6 0 1012 0c0-5-4-6-6-9z" />
                </svg>
              </span>
              <CardTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{t(locale, "homeGoodThingsToday")}</CardTitle>
            </div>
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
                <div className="mt-2 text-xs text-zinc-400">
                  {t(locale, "homeFrom")} {latestRec.fromUser?.name ?? "—"}
                </div>
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
                <div className="min-w-0 space-y-2">
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">
                    {t(locale, "homeCompanionLine")}: {companion.name ?? (locale === "zh" ? "小伙伴" : "Companion")} · {t(locale, "homeMood")}{" "}
                    {companion.mood} · {t(locale, "homeLevel")} {companion.level}
                  </p>
                  <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{t(locale, "homeCompanionEncouragement")}: </span>
                    {companionPepTalkForDay(locale, user.id)}
                  </p>
                </div>
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
