import Link from "next/link";
import type { Priority, ProjectStatus } from "@prisma/client";
import type { AccessUser } from "@/lib/access";
import { Card, CardTitle } from "@/components/ui/card";
import { countdownPhrase, isOverdue } from "@/lib/deadlines";
import { getHomeDashboardVisibleProjects, projectPriorityScore, TERMINAL_PROJECT } from "@/lib/home-dashboard-data";
import { getLocale } from "@/lib/locale";
import { t, tPriority, tProjectStatus, tWorkflowNodeStatus } from "@/lib/messages";

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
  timeZone: string,
): { badge: string; badgeClass: string; dotClass: string } {
  if (TERMINAL_PROJECT.includes(p.status)) {
    return { badge: tProjectStatus(locale, p.status), badgeClass: "bg-zinc-200/90 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300", dotClass: "bg-zinc-400" };
  }
  const overdue = p.deadline && isOverdue(p.deadline, new Date(), timeZone);
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

export async function HomePrioritiesSection({ user }: { user: AccessUser }) {
  const locale = await getLocale();
  const { visible } = await getHomeDashboardVisibleProjects(user);
  const nowMs = Date.now();
  const priorities = [...visible]
    .filter((p) => !TERMINAL_PROJECT.includes(p.status))
    .sort((a, b) => projectPriorityScore(b, nowMs) - projectPriorityScore(a, nowMs));

  return (
    <Card className="flex h-full min-h-0 w-full flex-col border-zinc-200/90 p-5">
      <div className="flex shrink-0 items-start gap-2">
        <span className="mt-0.5 text-amber-500" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7L12 17.8 5.7 21l2.3-7-6-4.6h7.6L12 2z" />
          </svg>
        </span>
        <div>
          <CardTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{t(locale, "homePriorities")}</CardTitle>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t(locale, "homePrioritiesHint")}</p>
        </div>
      </div>
      {priorities.length ? (
        <ul className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {priorities.map((p) => {
            const pct = Math.max(0, Math.min(100, p.progressPercent));
            const health = priorityHealth(p, locale, user.timezone);
            const activeLabel = p.status === "ACTIVE" ? tWorkflowNodeStatus(locale, "IN_PROGRESS") : tProjectStatus(locale, p.status);
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
                      <p className="mt-0.5 text-base text-zinc-500 dark:text-zinc-400">{p.company.name}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${health.badgeClass}`}>{health.badge}</span>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-zinc-500 sm:grid-cols-2 dark:text-zinc-400">
                  <div>
                    {t(locale, "homeOwner")} {p.owner.name}
                  </div>
                  <div className="sm:text-right">{countdownPhrase(p.deadline, new Date(), user.timezone)}</div>
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
        <p className="text-base text-zinc-500 dark:text-zinc-400">{t(locale, "homeNoPriorities")}</p>
      )}
    </Card>
  );
}
