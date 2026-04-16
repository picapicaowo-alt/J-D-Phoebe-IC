"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useOptimistic, useState, useTransition } from "react";
import { setProjectGroupMembershipAction } from "@/app/actions/project-group";
export type ProjectGroupRow = { id: string; name: string; sortOrder: number };

export type GroupedProjectCard = {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  ownerName: string;
  statusLabel: string;
  priorityLabel: string;
  relationsCount: number;
  knowledgeCount: number;
  deadlineLabel: string | null;
  overdue: boolean;
  statusCompleted: boolean;
  projectGroupId: string | null;
  groupSortOrder: number;
};

type Copy = {
  ungroupedTitle: string;
  dragHint: string;
  detail: string;
  ownerPrefix: string;
  metaRelations: string;
  metaKnowledge: string;
};

type ProjectMove = { projectId: string; projectGroupId: string | null };

function applyProjectMove(prev: GroupedProjectCard[], action: ProjectMove): GroupedProjectCard[] {
  const nextSortOrder =
    prev
      .filter((p) => p.id !== action.projectId && p.projectGroupId === action.projectGroupId)
      .reduce((max, p) => Math.max(max, p.groupSortOrder), -1) + 1;

  return prev.map((p) =>
    p.id === action.projectId
      ? { ...p, projectGroupId: action.projectGroupId, groupSortOrder: nextSortOrder }
      : p,
  );
}

export function ProjectsGroupedBoard({
  groups,
  projects,
  movableProjectIds,
  copy,
}: {
  groups: ProjectGroupRow[];
  projects: GroupedProjectCard[];
  movableProjectIds: string[];
  copy: Copy;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const movable = useMemo(() => new Set(movableProjectIds), [movableProjectIds]);
  const [optimisticProjects, moveOptimistic] = useOptimistic(projects, applyProjectMove);

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [groups],
  );

  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = { __ungrouped: true };
    for (const g of sortedGroups) init[g.id] = true;
    return init;
  });

  const byGroup = useMemo(() => {
    const map = new Map<string | null, GroupedProjectCard[]>();
    for (const p of optimisticProjects) {
      const k = p.projectGroupId;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.groupSortOrder - b.groupSortOrder || a.name.localeCompare(b.name));
    }
    return map;
  }, [optimisticProjects]);

  const moveProject = useCallback(
    (projectId: string, projectGroupId: string | null) => {
      const fd = new FormData();
      fd.set("projectId", projectId);
      fd.set("projectGroupId", projectGroupId ?? "");
      startTransition(async () => {
        moveOptimistic({ projectId, projectGroupId });
        await setProjectGroupMembershipAction(fd);
        router.refresh();
      });
    },
    [moveOptimistic, router],
  );

  const onDragStart = (e: React.DragEvent, projectId: string) => {
    if (!movable.has(projectId)) return;
    e.dataTransfer.setData("text/project-id", projectId);
    e.dataTransfer.effectAllowed = "move";
  };

  const allowDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onDropToGroup = (e: React.DragEvent, groupId: string | null) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/project-id");
    if (!id || !movable.has(id)) return;
    moveProject(id, groupId);
  };

  const renderCard = (p: GroupedProjectCard) => {
    const draggable = movable.has(p.id);
    return (
      <div
        key={p.id}
        draggable={draggable}
        onDragStart={(ev) => onDragStart(ev, p.id)}
        className={`flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm ${
          draggable ? "cursor-grab active:cursor-grabbing" : ""
        }`}
      >
        <div className="min-w-0 flex-1">
          <Link className="text-base font-semibold hover:underline" href={`/projects/${p.id}`} prefetch={false}>
            {p.name}
          </Link>
          <div className="mt-1 text-sm leading-6 text-[hsl(var(--muted))]">
            {p.companyName} · {copy.ownerPrefix} {p.ownerName}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm leading-6 text-[hsl(var(--foreground))]">
            <span>{p.statusLabel}</span>
            <span>·</span>
            <span>{p.priorityLabel}</span>
            <span>·</span>
            <span>
              {copy.metaRelations} {p.relationsCount}
            </span>
            <span>·</span>
            <span>
              {copy.metaKnowledge} {p.knowledgeCount}
            </span>
            {p.deadlineLabel ? (
              <>
                <span>·</span>
                <span className={p.overdue && !p.statusCompleted ? "text-rose-600" : ""}>{p.deadlineLabel}</span>
              </>
            ) : null}
          </div>
        </div>
        <Link className="shrink-0 text-sm text-[hsl(var(--accent))] hover:underline" href={`/projects/${p.id}`} prefetch={false}>
          {copy.detail}
        </Link>
      </div>
    );
  };

  const toggle = (key: string) => {
    setOpen((prev) => {
      const cur = prev[key] ?? true;
      return { ...prev, [key]: !cur };
    });
  };

  const isExpanded = (key: string) => open[key] ?? true;

  const chevron = (expanded: boolean) => (
    <span className="inline-flex w-5 shrink-0 justify-center text-[hsl(var(--muted))]" aria-hidden>
      {expanded ? "▾" : "▸"}
    </span>
  );

  const ungroupedList = byGroup.get(null) ?? [];

  return (
    <div className="space-y-2">
      <p className="text-xs text-[hsl(var(--muted))]">{copy.dragHint}</p>

      <section
        className="rounded-lg border border-dashed border-[hsl(var(--border))] bg-black/[0.02] p-2 dark:bg-white/[0.02]"
        onDragOver={movable.size ? allowDrop : undefined}
        onDrop={movable.size ? (e) => onDropToGroup(e, null) : undefined}
      >
        <button
          type="button"
          onClick={() => toggle("__ungrouped")}
          className="flex w-full items-center gap-1 rounded-md px-1 py-2 text-left text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
        >
          {chevron(isExpanded("__ungrouped"))}
          <span>{copy.ungroupedTitle}</span>
          <span className="text-xs font-normal text-[hsl(var(--muted))]">({ungroupedList.length})</span>
        </button>
        {isExpanded("__ungrouped") ? (
          <div className="ml-6 space-y-2 border-l border-[hsl(var(--border))]/60 pl-3">{ungroupedList.map(renderCard)}</div>
        ) : null}
      </section>

      {sortedGroups.map((g) => {
        const list = byGroup.get(g.id) ?? [];
        const expanded = isExpanded(g.id);
        return (
          <section
            key={g.id}
            className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 shadow-sm"
            onDragOver={movable.size ? allowDrop : undefined}
            onDrop={movable.size ? (e) => onDropToGroup(e, g.id) : undefined}
          >
            <button
              type="button"
              onClick={() => toggle(g.id)}
              className="flex w-full items-center gap-1 rounded-md px-1 py-2 text-left text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
            >
              {chevron(expanded)}
              <span>{g.name}</span>
              <span className="text-xs font-normal text-[hsl(var(--muted))]">({list.length})</span>
            </button>
            {expanded ? <div className="ml-6 space-y-2 border-l border-[hsl(var(--border))]/60 pl-3">{list.map(renderCard)}</div> : null}
          </section>
        );
      })}
    </div>
  );
}
