import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import type { AccessUser } from "@/lib/access";
import { getHomeDashboardVisibleWorkflowNodes } from "@/lib/home-dashboard-data";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import {
  isAtRiskNode,
  isBlockedNode,
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

function isExecutionNode(node: Awaited<ReturnType<typeof getHomeDashboardVisibleWorkflowNodes>>[number]) {
  return !isBlockedNode(node) && !isPendingApprovalNode(node) && !isWaitingNode(node) && (isAtRiskNode(node) || isOverdueNode(node) || node.isProjectBottleneck);
}

function isResponseNode(node: Awaited<ReturnType<typeof getHomeDashboardVisibleWorkflowNodes>>[number]) {
  return !isBlockedNode(node) && !isPendingApprovalNode(node) && isWaitingNode(node);
}

export async function HomeExecutionSnapshotSection({
  user,
  snapshot,
}: {
  user: AccessUser;
  snapshot: string;
}) {
  const locale = await getLocale();
  const nodes = await getHomeDashboardVisibleWorkflowNodes(user);
  const activeSnapshot = normalizeSnapshot(snapshot);

  const categories: {
    key: SnapshotCategory;
    label: string;
    count: number;
    tone: string;
  }[] = [
    {
      key: "response",
      label: t(locale, "homeResponseQueue"),
      count: nodes.filter((node) => isResponseNode(node)).length,
      tone: "text-amber-700 dark:text-amber-300",
    },
    {
      key: "approval",
      label: t(locale, "homeApprovalQueue"),
      count: nodes.filter((node) => isPendingApprovalNode(node)).length,
      tone: "text-sky-600 dark:text-sky-400",
    },
    {
      key: "execution",
      label: t(locale, "homeExecutionQueue"),
      count: nodes.filter((node) => isExecutionNode(node)).length,
      tone: "text-orange-700 dark:text-orange-300",
    },
    {
      key: "blocked",
      label: t(locale, "homeBlockedNodes"),
      count: nodes.filter((node) => isBlockedNode(node)).length,
      tone: "text-rose-600 dark:text-rose-400",
    },
  ];

  return (
    <Card className="space-y-4 border-zinc-200/90 p-5">
      <div className="space-y-1">
        <CardTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{t(locale, "homeExecutionSnapshot")}</CardTitle>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t(locale, "homeExecutionSnapshotLead")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => {
          const active = activeSnapshot === category.key;
          return (
            <Link
              key={category.key}
              href={active ? "/home" : `/home?snapshot=${category.key}`}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
                active
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                  : "border-zinc-200/80 bg-white/90 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-200 dark:hover:bg-zinc-900/70"
              }`}
            >
              <span>{category.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  active ? "bg-white/15 text-white dark:bg-zinc-900/10 dark:text-zinc-950" : category.tone
                }`}
              >
                {category.count}
              </span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
