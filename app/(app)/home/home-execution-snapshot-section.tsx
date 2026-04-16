import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import type { AccessUser } from "@/lib/access";
import { getHomeDashboardVisibleWorkflowNodes } from "@/lib/home-dashboard-data";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import {
  getWaitingEscalation,
  isAtRiskNode,
  isBlockedNode,
  isExternalWaitingNode,
  isInternalWaitingNode,
  isOverdueNode,
  isPendingApprovalNode,
  isWaitingNode,
} from "@/lib/workflow-node-operations";

type SnapshotCard = {
  href: string;
  label: string;
  count: number;
  tone: string;
};

export async function HomeExecutionSnapshotSection({ user }: { user: AccessUser }) {
  const locale = await getLocale();
  const nodes = await getHomeDashboardVisibleWorkflowNodes(user);

  const waitingNodes = nodes.filter((node) => isWaitingNode(node));
  const cards: SnapshotCard[] = [
    {
      href: "/home?snapshot=blocked",
      label: t(locale, "homeBlockedNodes"),
      count: nodes.filter((node) => isBlockedNode(node)).length,
      tone: "text-rose-600 dark:text-rose-400",
    },
    {
      href: "/home?snapshot=approvals",
      label: t(locale, "homeApprovalsNeeded"),
      count: nodes.filter((node) => isPendingApprovalNode(node)).length,
      tone: "text-sky-600 dark:text-sky-400",
    },
    {
      href: "/home?snapshot=waiting-internal",
      label: t(locale, "homeWaitingInternal"),
      count: nodes.filter((node) => isInternalWaitingNode(node)).length,
      tone: "text-amber-700 dark:text-amber-300",
    },
    {
      href: "/home?snapshot=waiting-external",
      label: t(locale, "homeWaitingExternal"),
      count: nodes.filter((node) => isExternalWaitingNode(node)).length,
      tone: "text-orange-700 dark:text-orange-300",
    },
    {
      href: "/home?snapshot=longest",
      label: t(locale, "homeLongestWaiting"),
      count: waitingNodes.length,
      tone: "text-fuchsia-700 dark:text-fuchsia-300",
    },
    {
      href: "/home?snapshot=overdue",
      label: t(locale, "homeOverdueItems"),
      count: nodes.filter((node) => isOverdueNode(node)).length,
      tone: "text-rose-700 dark:text-rose-300",
    },
    {
      href: "/home?snapshot=risk",
      label: t(locale, "homeRiskItems"),
      count: nodes.filter((node) => isAtRiskNode(node) || node.isProjectBottleneck || getWaitingEscalation(node)?.level === "warning").length,
      tone: "text-orange-700 dark:text-orange-300",
    },
  ];

  return (
    <Card className="space-y-4 border-zinc-200/90 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{t(locale, "homeExecutionSnapshot")}</CardTitle>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t(locale, "homeExecutionSnapshotLead")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-xl border border-zinc-200/80 bg-white/90 p-4 transition hover:-translate-y-0.5 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/40 dark:hover:bg-zinc-900/70"
          >
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{card.label}</p>
            <div className={`mt-2 text-2xl font-semibold ${card.tone}`}>{card.count}</div>
          </Link>
        ))}
      </div>
    </Card>
  );
}
