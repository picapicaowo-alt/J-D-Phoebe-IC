import Link from "next/link";
import type { ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AccessUser } from "@/lib/access";
import { Card, CardTitle } from "@/components/ui/card";
import { getHomeDashboardVisibleProjects } from "@/lib/home-dashboard-data";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";

export async function HomeExecutionSnapshotSection({ user }: { user: AccessUser }) {
  const locale = await getLocale();
  const { visibleIds } = await getHomeDashboardVisibleProjects(user);
  const projectScope = visibleIds.length ? { projectId: { in: visibleIds } } : { projectId: { in: ["__none__"] } };

  const [blockedCount, waitingCount, approvalCount, dueSoonCount] = await Promise.all([
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
    prisma.project.count({
      where: {
        deletedAt: null,
        id: visibleIds.length ? { in: visibleIds } : { in: ["__none__"] },
        status: { in: ["PLANNING", "ACTIVE", "AT_RISK", "ON_HOLD"] as ProjectStatus[] },
        deadline: { lte: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), not: null },
      },
    }),
  ]);

  return (
    <Card className="space-y-3 border-zinc-200/90 p-5">
      <CardTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{t(locale, "homeExecutionSnapshot")}</CardTitle>
      <ul className="space-y-2 text-base">
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
  );
}
