import Link from "next/link";
import type { WorkflowNodeStatus, WorkflowNodeType } from "@prisma/client";
import { childrenByParentId } from "@/lib/workflow-node-tree";
import type { Locale } from "@/lib/locale";
import { t, tWorkflowNodeStatus, tWorkflowNodeType } from "@/lib/messages";
import { aggregateChildrenProgress, displayNodeProgress } from "@/lib/task-progress";
import { UserFace } from "@/components/user-face";

export type ProjectMapNodeLite = {
  id: string;
  title: string;
  parentNodeId: string | null;
  sortOrder: number;
  status: WorkflowNodeStatus;
  nodeType: WorkflowNodeType;
  progressPercent: number;
  assignees?: { id: string; name: string; avatarUrl: string | null }[];
};

function statusDot(status: WorkflowNodeStatus) {
  if (status === "DONE") return "bg-emerald-500";
  if (status === "IN_PROGRESS") return "bg-sky-500";
  if (status === "BLOCKED") return "bg-rose-500";
  return "bg-slate-400";
}

function nodeIcon(nodeType: WorkflowNodeType) {
  if (nodeType === "MILESTONE") return "◆";
  if (nodeType === "APPROVAL") return "✔";
  if (nodeType === "WAITING") return "⏸";
  if (nodeType === "COMPLETED") return "●";
  return "•";
}

function Branch({
  node,
  byParent,
  locale,
  projectId,
  depth,
}: {
  node: ProjectMapNodeLite;
  byParent: Map<string | null, ProjectMapNodeLite[]>;
  locale: Locale;
  projectId: string;
  depth: number;
}) {
  const kids = byParent.get(node.id) ?? [];
  const statusColor = statusDot(node.status);
  const icon = nodeIcon(node.nodeType);
  const selfPct = displayNodeProgress(node.progressPercent, node.status);
  const barPct = kids.length ? aggregateChildrenProgress(kids) : selfPct;
  const barHeight = depth > 0 ? "h-2" : "h-2.5";

  return (
    <div className={depth > 0 ? "ml-3 border-l border-[hsl(var(--border))] pl-3" : ""}>
      <div className="flex items-start gap-2 rounded-md border border-[hsl(var(--border))] px-2 py-2 text-sm">
        <div className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center">
          <span className={`inline-flex h-2.5 w-2.5 rounded-full ${statusColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium">
            <span className="mr-1 text-[hsl(var(--muted))]">{icon}</span>
            <Link className="hover:underline" href={`/projects/${projectId}/nodes/${node.id}`}>
              {node.title}
            </Link>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[hsl(var(--muted))]">
            <span>
              {tWorkflowNodeType(locale, node.nodeType)} · {tWorkflowNodeStatus(locale, node.status)}
            </span>
            {node.assignees?.length ? (
              <span className="flex items-center gap-1">
                {node.assignees.map((u) => (
                  <UserFace key={u.id} name={u.name} avatarUrl={u.avatarUrl} size={22} />
                ))}
              </span>
            ) : null}
          </div>
        </div>
        <div className="w-28 shrink-0 space-y-0.5">
          <div className="flex justify-between text-[10px] text-[hsl(var(--muted))]">
            <span>{kids.length ? t(locale, "projTaskRollupHint") : t(locale, "projSubtaskProgressHint")}</span>
            <span className="font-medium text-[hsl(var(--foreground))]">{barPct}%</span>
          </div>
          <div className={`w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700 ${barHeight}`}>
            <div className={`${barHeight} rounded-full bg-zinc-900 dark:bg-zinc-100`} style={{ width: `${barPct}%` }} />
          </div>
        </div>
      </div>
      {kids.length ? (
        <details className="mt-1">
          <summary className="cursor-pointer select-none text-xs text-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]">
            {t(locale, "projSubtasksToggle")} ({kids.length})
          </summary>
          <div className="mt-1 space-y-1">
            {kids.map((c) => (
              <Branch key={c.id} node={c} byParent={byParent} locale={locale} projectId={projectId} depth={depth + 1} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function ProjectMapNestedNodes({
  nodes,
  locale,
  projectId,
}: {
  /** Nodes in this lane (same layer); may include subtrees whose parent is also in the lane. */
  nodes: ProjectMapNodeLite[];
  locale: Locale;
  projectId: string;
}) {
  const ids = new Set(nodes.map((n) => n.id));
  const roots = nodes.filter((n) => !n.parentNodeId || !ids.has(n.parentNodeId));
  const byParent = childrenByParentId(nodes);
  if (!roots.length) return null;
  return (
    <div className="space-y-2">
      {roots.map((n) => (
        <Branch key={n.id} node={n} byParent={byParent} locale={locale} projectId={projectId} depth={0} />
      ))}
    </div>
  );
}
