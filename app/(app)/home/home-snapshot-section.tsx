import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AccessUser } from "@/lib/access";
import { getHomeDashboardVisibleWorkflowNodes } from "@/lib/home-dashboard-data";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import {
  formatWorkflowNodeLabel,
  getApprovalOwnerDisplay,
  getOperationalNextAction,
  getWaitingEscalation,
  getWaitingOnDisplay,
  isAtRiskNode,
  isBlockedNode,
  isExternalWaitingNode,
  isInternalWaitingNode,
  isOverdueNode,
  isPendingApprovalNode,
  isWaitingNode,
} from "@/lib/workflow-node-operations";

type SnapshotCategory = "response" | "approval" | "execution" | "blocked";

function normalizeSnapshot(snapshot: string): SnapshotCategory | null {
  if (snapshot === "response" || snapshot === "waiting-internal" || snapshot === "waiting-external" || snapshot === "longest") {
    return "response";
  }
  if (snapshot === "approval" || snapshot === "approvals") return "approval";
  if (snapshot === "execution" || snapshot === "risk" || snapshot === "overdue") return "execution";
  if (snapshot === "blocked") return "blocked";
  return null;
}

function fmtShortDate(date: Date | null | undefined, locale: "en" | "zh") {
  if (!date) return null;
  return date.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-GB", { year: "numeric", month: "short", day: "numeric" });
}

function isExecutionNode(node: Awaited<ReturnType<typeof getHomeDashboardVisibleWorkflowNodes>>[number]) {
  return !isBlockedNode(node) && !isPendingApprovalNode(node) && !isWaitingNode(node) && (isAtRiskNode(node) || isOverdueNode(node) || node.isProjectBottleneck);
}

function isResponseNode(node: Awaited<ReturnType<typeof getHomeDashboardVisibleWorkflowNodes>>[number]) {
  return !isBlockedNode(node) && !isPendingApprovalNode(node) && isWaitingNode(node);
}

export async function HomeSnapshotSection({ user, snapshot }: { user: AccessUser; snapshot: string }) {
  const normalizedSnapshot = normalizeSnapshot(snapshot);
  if (!normalizedSnapshot) return null;

  const locale = await getLocale();
  const nodes = await getHomeDashboardVisibleWorkflowNodes(user);

  const rows =
    normalizedSnapshot === "blocked"
      ? nodes.filter((node) => isBlockedNode(node))
      : normalizedSnapshot === "approval"
        ? nodes.filter((node) => isPendingApprovalNode(node))
        : normalizedSnapshot === "response"
          ? nodes
              .filter((node) => isResponseNode(node))
              .sort((a, b) => (getWaitingEscalation(b)?.days ?? -1) - (getWaitingEscalation(a)?.days ?? -1))
          : nodes.filter((node) => isExecutionNode(node));

  const titleMap = {
    blocked: t(locale, "homeSnapshotBlockedTitle"),
    approval: t(locale, "homeSnapshotApprovalsTitle"),
    response: t(locale, "homeSnapshotResponseTitle"),
    execution: t(locale, "homeSnapshotExecutionTitle"),
  } as const;

  return (
    <Card className="space-y-4 border-zinc-200/90 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{titleMap[normalizedSnapshot]}</CardTitle>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t(locale, "homeSnapshotLead")}</p>
        </div>
        <Link href="/home" className="text-sm font-medium text-zinc-600 underline underline-offset-4 dark:text-zinc-300">
          {t(locale, "btnReset")}
        </Link>
      </div>
      {!rows.length ? (
        <p className="text-base text-zinc-500">{t(locale, "homeSnapshotEmpty")}</p>
      ) : (
        <div className="space-y-3">
          {rows.slice(0, 40).map((node) => {
            const waitingEscalation = getWaitingEscalation(node);
            const waitingOn = getWaitingOnDisplay(node);
            const approver = getApprovalOwnerDisplay(node);
            const currentState =
              isBlockedNode(node)
                ? "Blocked"
                : isPendingApprovalNode(node)
                  ? "Pending approval"
                  : isInternalWaitingNode(node)
                    ? "Waiting on internal response"
                    : isExternalWaitingNode(node)
                      ? "Waiting on external response"
                      : isOverdueNode(node)
                        ? "Overdue"
                        : isAtRiskNode(node)
                          ? "At risk"
                          : node.status.replaceAll("_", " ");
            const issue =
              node.waitingDetails?.trim()
                ? node.waitingDetails.trim()
                : isBlockedNode(node)
                  ? "This work is blocked and needs intervention."
                  : isPendingApprovalNode(node)
                    ? "This work is waiting for a review decision."
                    : isExternalWaitingNode(node)
                      ? "This work is stuck on an external response."
                      : isInternalWaitingNode(node)
                        ? "This work is stuck on an internal teammate."
                        : isOverdueNode(node)
                          ? "This work is overdue."
                          : isAtRiskNode(node)
                            ? "This work is trending toward delay."
                            : "This work needs follow-up.";

            return (
              <Link
                key={node.id}
                href={`/projects/${node.projectId}?task=${node.id}#task-${node.id}`}
                className="block rounded-xl border border-zinc-200/90 p-4 transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/60"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{node.title}</p>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{node.project.name}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={isBlockedNode(node) ? "bad" : isPendingApprovalNode(node) ? "info" : isAtRiskNode(node) ? "warn" : "neutral"}>
                      {currentState}
                    </Badge>
                    {node.isProjectBottleneck ? <Badge tone="bad">Bottleneck</Badge> : null}
                    {node.operationalLabels.slice(0, 2).map((label) => (
                      <Badge key={label} tone={label === "AT_RISK" ? "warn" : label === "BLOCKED" || label === "OVERDUE" ? "bad" : "neutral"}>
                        {formatWorkflowNodeLabel(label)}
                      </Badge>
                    ))}
                  </div>
                </div>
                <dl className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                  <div>
                    <dt className="font-medium text-zinc-700 dark:text-zinc-300">{t(locale, "homeSnapshotIssueLabel")}</dt>
                    <dd className="mt-1 text-zinc-500 dark:text-zinc-400">{issue}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-700 dark:text-zinc-300">{t(locale, "homeSnapshotWaitingOnLabel")}</dt>
                    <dd className="mt-1 text-zinc-500 dark:text-zinc-400">{waitingOn ?? approver ?? "Not recorded"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-700 dark:text-zinc-300">{t(locale, "homeSnapshotHowLongLabel")}</dt>
                    <dd className="mt-1 text-zinc-500 dark:text-zinc-400">
                      {waitingEscalation ? `${waitingEscalation.days} day${waitingEscalation.days === 1 ? "" : "s"}` : "Not waiting"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-700 dark:text-zinc-300">{t(locale, "homeSnapshotBelongsToLabel")}</dt>
                    <dd className="mt-1 text-zinc-500 dark:text-zinc-400">{node.project.name}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-700 dark:text-zinc-300">{t(locale, "homeSnapshotStateLabel")}</dt>
                    <dd className="mt-1 text-zinc-500 dark:text-zinc-400">{currentState}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-700 dark:text-zinc-300">{t(locale, "homeSnapshotNextActionLabel")}</dt>
                    <dd className="mt-1 text-zinc-500 dark:text-zinc-400">{getOperationalNextAction(node)}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {node.assignees[0]?.user?.name ? <span>Assignee: {node.assignees[0].user.name}</span> : null}
                  {approver ? <span>Approver: {approver}</span> : null}
                  {node.dueAt ? <span>Due: {fmtShortDate(node.dueAt, locale)}</span> : null}
                  {node.approvalRequestedAt ? <span>Requested: {fmtShortDate(node.approvalRequestedAt, locale)}</span> : null}
                  {node.waitingStartedAt ? <span>Waiting since: {fmtShortDate(node.waitingStartedAt, locale)}</span> : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}
