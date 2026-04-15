import Link from "next/link";
import type { ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AccessUser } from "@/lib/access";
import { Card, CardTitle } from "@/components/ui/card";
import { countdownPhrase } from "@/lib/deadlines";
import { getHomeDashboardVisibleProjects } from "@/lib/home-dashboard-data";
import { getLocale } from "@/lib/locale";
import { t, tWorkflowNodeStatus } from "@/lib/messages";

const SNAPSHOT_KEYS = new Set(["blocked", "waiting", "approvals", "due"]);

export async function HomeSnapshotSection({ user, snapshot }: { user: AccessUser; snapshot: string }) {
  if (!snapshot || !SNAPSHOT_KEYS.has(snapshot)) return null;

  const locale = await getLocale();
  const { visibleIds } = await getHomeDashboardVisibleProjects(user);
  const projectScope = visibleIds.length ? { projectId: { in: visibleIds } } : { projectId: { in: ["__none__"] } };
  const projectRowScope = visibleIds.length ? { id: { in: visibleIds } } : { id: { in: ["__none__"] } };

  const dueSoonWhere = {
    deletedAt: null,
    ...projectRowScope,
    status: { in: ["PLANNING", "ACTIVE", "AT_RISK", "ON_HOLD"] as ProjectStatus[] },
    deadline: { lte: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), not: null },
  };

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

  const [blockedRows, waitingRows, approvalRows, dueRows] = await Promise.all([
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
          include: { company: true },
          orderBy: { deadline: "asc" },
          take: 30,
        })
      : Promise.resolve([]),
  ]);

  if (!snapTitle) return null;

  return (
    <Card className="space-y-3 border-zinc-200/90 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{snapTitle}</CardTitle>
        <Link href="/home" className="text-base font-medium text-zinc-600 underline underline-offset-4 dark:text-zinc-300">
          {t(locale, "btnReset")}
        </Link>
      </div>
      {snapshot === "due" ? (
        dueRows.length ? (
          <ul className="space-y-2 text-base">
            {dueRows.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <Link href={`/projects/${p.id}`} className="font-medium text-zinc-900 hover:underline dark:text-zinc-50">
                  {p.name}
                </Link>
                <span className="text-base text-zinc-500">
                  {p.company.name} · {countdownPhrase(p.deadline)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-base text-zinc-500">{t(locale, "homeSnapshotEmpty")}</p>
        )
      ) : snapshot === "blocked" || snapshot === "waiting" || snapshot === "approvals" ? (
        (() => {
          const rows = snapshot === "blocked" ? blockedRows : snapshot === "waiting" ? waitingRows : approvalRows;
          return rows.length ? (
            <ul className="space-y-2 text-base">
              {rows.map((n) => (
                <li key={n.id} className="rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800">
                  <div className="font-medium text-zinc-900 dark:text-zinc-50">{n.title}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-base text-zinc-500">
                    <Link className="hover:underline" href={`/projects/${n.projectId}`}>
                      {n.project.name}
                    </Link>
                    <span>{tWorkflowNodeStatus(locale, n.status)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-base text-zinc-500">{t(locale, "homeSnapshotEmpty")}</p>
          );
        })()
      ) : null}
    </Card>
  );
}
