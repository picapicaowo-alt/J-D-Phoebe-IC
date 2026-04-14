import type { WorkflowNodeStatus } from "@prisma/client";

/** Visual progress from stored percent, boosted to 100% when terminal-complete. */
export function displayNodeProgress(progressPercent: number, status: WorkflowNodeStatus): number {
  if (status === "DONE" || status === "SKIPPED") return 100;
  return Math.max(0, Math.min(100, progressPercent));
}

/** Average of direct children’s display progress (empty → 0). */
export function aggregateChildrenProgress(
  children: { progressPercent: number; status: WorkflowNodeStatus }[],
): number {
  if (!children.length) return 0;
  const sum = children.reduce((acc, c) => acc + displayNodeProgress(c.progressPercent, c.status), 0);
  return Math.round(sum / children.length);
}

export type RollupNode = {
  id: string;
  parentNodeId: string | null;
  sortOrder: number;
  progressPercent: number;
  status: WorkflowNodeStatus;
};

/** Project % = average of top-level task display percents (each task uses aggregate of its subtasks if any). */
export function projectRollupPercentFromTasks(nodes: RollupNode[]): number {
  const roots = nodes.filter((n) => !n.parentNodeId).sort((a, b) => a.sortOrder - b.sortOrder);
  if (!roots.length) return 0;
  const byParent = new Map<string | null, RollupNode[]>();
  for (const n of nodes) {
    const k = n.parentNodeId;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(n);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const taskDisplay = (id: string): number => {
    const kids = byParent.get(id) ?? [];
    if (!kids.length) {
      const self = nodes.find((x) => x.id === id);
      return self ? displayNodeProgress(self.progressPercent, self.status) : 0;
    }
    return aggregateChildrenProgress(kids);
  };

  const rootVals = roots.map((r) => taskDisplay(r.id));
  return Math.round(rootVals.reduce((a, b) => a + b, 0) / rootVals.length);
}
