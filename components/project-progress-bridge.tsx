"use client";

import { useState, useCallback, useEffect } from "react";
import { ProjectTasksPanel, type ProjectTaskRow, type ProjectTasksCopy } from "@/components/project-tasks-panel";

/** Compute overall project progress from the live (optimistic) task forest. */
function computeOverallProgress(tasks: ProjectTaskRow[]): number {
  if (!tasks.length) return 0;

  function nodeProgress(t: ProjectTaskRow): number {
    if (!t.children.length) return Math.max(0, Math.min(100, t.progressPercent));
    const childVals = t.children.map(nodeProgress);
    return Math.round(childVals.reduce((a, b) => a + b, 0) / childVals.length);
  }

  const rootVals = tasks.map(nodeProgress);
  return Math.round(rootVals.reduce((a, b) => a + b, 0) / rootVals.length);
}

/**
 * Renders the live-updating progress percent text.
 * Subscribes to task changes via a CustomEvent dispatched by ProjectTasksPanel.
 */
export function ProjectProgressDisplay({
  initialProgressPct,
  initialTasks,
}: {
  initialProgressPct: number;
  initialTasks: ProjectTaskRow[];
}) {
  const [pct, setPct] = useState(initialProgressPct);

  useEffect(() => {
    function handler(e: Event) {
      const tasks = (e as CustomEvent<ProjectTaskRow[]>).detail;
      setPct(computeOverallProgress(tasks));
    }
    window.addEventListener("project-tasks-optimistic-change", handler);
    return () => window.removeEventListener("project-tasks-optimistic-change", handler);
  }, []);

  // Sync when server re-renders with new data
  useEffect(() => {
    setPct(computeOverallProgress(initialTasks.length ? initialTasks : []));
  }, [initialTasks]);

  return <p className="text-sm font-semibold tabular-nums text-[hsl(var(--foreground))]">{pct}%</p>;
}

/**
 * Renders the live-updating progress bar.
 * Subscribes to task changes via a CustomEvent dispatched by ProjectTasksPanel.
 */
export function ProjectProgressBar({
  initialProgressPct,
  initialTasks,
}: {
  initialProgressPct: number;
  initialTasks: ProjectTaskRow[];
}) {
  const [pct, setPct] = useState(initialProgressPct);

  useEffect(() => {
    function handler(e: Event) {
      const tasks = (e as CustomEvent<ProjectTaskRow[]>).detail;
      setPct(computeOverallProgress(tasks));
    }
    window.addEventListener("project-tasks-optimistic-change", handler);
    return () => window.removeEventListener("project-tasks-optimistic-change", handler);
  }, []);

  useEffect(() => {
    setPct(computeOverallProgress(initialTasks.length ? initialTasks : []));
  }, [initialTasks]);

  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[rgba(3,2,19,0.2)] dark:bg-white/20">
      <div className="h-full rounded-full bg-zinc-900 dark:bg-zinc-100 transition-[width] duration-300" style={{ width: `${w}%` }} />
    </div>
  );
}

/**
 * Wraps ProjectTasksPanel and dispatches a CustomEvent whenever optimistic tasks change,
 * so that ProjectProgressDisplay and ProjectProgressBar can update independently.
 */
export function ProjectTasksPanelWithProgress({
  projectId,
  tasks,
  canEdit,
  undoAvailable,
  memberOptions,
  copy,
  locale,
}: {
  projectId: string;
  tasks: ProjectTaskRow[];
  canEdit: boolean;
  undoAvailable: boolean;
  memberOptions: { id: string; name: string }[];
  copy: ProjectTasksCopy;
  locale: "en" | "zh";
}) {
  const handleOptimisticChange = useCallback((optimisticTasks: ProjectTaskRow[]) => {
    window.dispatchEvent(
      new CustomEvent("project-tasks-optimistic-change", { detail: optimisticTasks }),
    );
  }, []);

  return (
    <ProjectTasksPanel
      projectId={projectId}
      tasks={tasks}
      canEdit={canEdit}
      undoAvailable={undoAvailable}
      memberOptions={memberOptions}
      copy={copy}
      locale={locale}
      onOptimisticTasksChange={handleOptimisticChange}
    />
  );
}
