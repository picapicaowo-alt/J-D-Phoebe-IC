/** Max workflow depth under a project: top-level task (1) + subtasks (2). Project itself is not a row. */
export const MAX_TASK_DEPTH = 2;

export type NodeTreeFields = {
  id: string;
  parentNodeId: string | null;
  sortOrder: number;
};

export function childrenByParentId<T extends NodeTreeFields>(nodes: T[]): Map<string | null, T[]> {
  const m = new Map<string | null, T[]>();
  for (const n of nodes) {
    const k = n.parentNodeId;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(n);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return m;
}

export function depthFromRoot<T extends NodeTreeFields>(byId: Map<string, T>, nodeId: string): number {
  let d = 0;
  let cur: string | undefined = nodeId;
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur)) return 999;
    seen.add(cur);
    d++;
    const n = byId.get(cur);
    cur = n?.parentNodeId ?? undefined;
  }
  return d;
}

/** Largest distance from `nodeId` down to a descendant (0 if leaf). */
export function maxDescendantDepthOffset<T extends NodeTreeFields>(byParent: Map<string | null, T[]>, nodeId: string): number {
  let max = 0;
  const walk = (id: string, offset: number) => {
    const kids = byParent.get(id) ?? [];
    for (const c of kids) {
      max = Math.max(max, offset);
      walk(c.id, offset + 1);
    }
  };
  walk(nodeId, 1);
  return max;
}

export function isDescendant<T extends NodeTreeFields>(
  byParent: Map<string | null, T[]>,
  ancestorId: string,
  maybeDescendantId: string,
): boolean {
  const stack = [...(byParent.get(ancestorId) ?? [])];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.id === maybeDescendantId) return true;
    stack.push(...(byParent.get(n.id) ?? []));
  }
  return false;
}

export function canSetParent<T extends NodeTreeFields>(
  byId: Map<string, T>,
  byParent: Map<string | null, T[]>,
  nodeId: string,
  newParentId: string | null,
): { ok: true } | { ok: false; reason: string } {
  if (newParentId === nodeId) return { ok: false, reason: "Cannot set self as parent." };
  if (!newParentId) return { ok: true };
  if (isDescendant(byParent, nodeId, newParentId)) {
    return { ok: false, reason: "Cannot move under a descendant." };
  }
  const parentDepth = depthFromRoot(byId, newParentId);
  const subtree = maxDescendantDepthOffset(byParent, nodeId);
  if (parentDepth + 1 + subtree > MAX_TASK_DEPTH) {
    return { ok: false, reason: `Hierarchy is limited to ${MAX_TASK_DEPTH} levels.` };
  }
  return { ok: true };
}
