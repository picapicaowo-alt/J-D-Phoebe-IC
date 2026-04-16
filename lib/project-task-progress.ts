import { WorkflowNodeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function statusFromAggregatedProgress(p: number): WorkflowNodeStatus {
  if (p >= 100) return "DONE";
  if (p > 0) return "IN_PROGRESS";
  return "NOT_STARTED";
}

/**
 * Recompute each node's progress from children (average) or keep leaf values,
 * then set project.progressPercent to the average of top-level tasks.
 */
export async function syncProjectTaskRollups(projectId: string) {
  const nodes = await prisma.workflowNode.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true, parentNodeId: true, progressPercent: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  });

  if (!nodes.length) {
    await prisma.project.update({ where: { id: projectId }, data: { progressPercent: 0 } });
    return;
  }

  const childrenByParent = new Map<string | null, typeof nodes>();
  for (const n of nodes) {
    const key = n.parentNodeId;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key)!.push(n);
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const computed = new Map<string, number>();
  const self = new Map(nodes.map((n) => [n.id, n]));

  function resolve(id: string): number {
    if (computed.has(id)) return computed.get(id)!;
    const kids = childrenByParent.get(id) ?? [];
    let v: number;
    if (!kids.length) {
      v = Math.max(0, Math.min(100, self.get(id)!.progressPercent));
    } else {
      const vals = kids.map((k) => resolve(k.id));
      v = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
    computed.set(id, v);
    return v;
  }

  const roots = childrenByParent.get(null) ?? [];
  for (const r of roots) resolve(r.id);

  await prisma.$transaction(
    nodes.map((n) => {
      const pct = computed.get(n.id)!;
      return prisma.workflowNode.update({
        where: { id: n.id },
        data: childrenByParent.get(n.id)?.length ? { progressPercent: pct, status: statusFromAggregatedProgress(pct) } : { progressPercent: pct },
      });
    }),
  );

  const rootPct = roots.length
    ? Math.round(roots.reduce((s, r) => s + (computed.get(r.id) ?? 0), 0) / roots.length)
    : 0;
  await prisma.project.update({ where: { id: projectId }, data: { progressPercent: rootPct } });
}
