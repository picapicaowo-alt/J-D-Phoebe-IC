"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ProjectTasksPanel, type ProjectTaskRow, type ProjectTasksCopy } from "@/components/project-tasks-panel";

type ProjectProgressContextValue = {
  liveTasks: ProjectTaskRow[];
  setLiveTasks: (tasks: ProjectTaskRow[]) => void;
};

const ProjectProgressContext = createContext<ProjectProgressContextValue | null>(null);

function computeOverallProgress(tasks: ProjectTaskRow[]): number {
  if (!tasks.length) return 0;

  function nodeProgress(task: ProjectTaskRow): number {
    if (!task.children.length) return Math.max(0, Math.min(100, task.progressPercent));
    const childValues = task.children.map(nodeProgress);
    return Math.round(childValues.reduce((sum, value) => sum + value, 0) / childValues.length);
  }

  const rootValues = tasks.map(nodeProgress);
  return Math.round(rootValues.reduce((sum, value) => sum + value, 0) / rootValues.length);
}

function useProjectProgressState(initialTasks: ProjectTaskRow[]) {
  const [liveTasks, setLiveTasks] = useState(initialTasks);

  useEffect(() => {
    setLiveTasks(initialTasks);
  }, [initialTasks]);

  return useMemo(
    () => ({
      liveTasks,
      setLiveTasks,
    }),
    [liveTasks],
  );
}

function useProjectProgressContext() {
  const value = useContext(ProjectProgressContext);
  if (!value) throw new Error("Project progress components must be wrapped in ProjectProgressProvider.");
  return value;
}

export function ProjectProgressProvider({
  initialTasks,
  children,
}: {
  initialTasks: ProjectTaskRow[];
  children: React.ReactNode;
}) {
  const value = useProjectProgressState(initialTasks);
  return <ProjectProgressContext.Provider value={value}>{children}</ProjectProgressContext.Provider>;
}

export function ProjectProgressDisplay() {
  const { liveTasks } = useProjectProgressContext();
  const pct = computeOverallProgress(liveTasks);
  return <p className="text-sm font-semibold tabular-nums text-[hsl(var(--foreground))]">{pct}%</p>;
}

export function ProjectProgressBar() {
  const { liveTasks } = useProjectProgressContext();
  const pct = computeOverallProgress(liveTasks);
  const width = Math.max(0, Math.min(100, pct));

  return (
    <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[rgba(3,2,19,0.2)] dark:bg-white/20">
      <div className="h-full rounded-full bg-zinc-900 dark:bg-zinc-100 transition-[width] duration-300" style={{ width: `${width}%` }} />
    </div>
  );
}

export function ProjectTasksPanelWithProgress({
  projectId,
  tasks,
  canEdit,
  undoAvailable,
  memberOptions,
  labelMemberOptions,
  copy,
  locale,
}: {
  projectId: string;
  tasks: ProjectTaskRow[];
  canEdit: boolean;
  undoAvailable: boolean;
  memberOptions: { id: string; name: string }[];
  labelMemberOptions: { id: string; name: string }[];
  copy: ProjectTasksCopy;
  locale: "en" | "zh";
}) {
  const { setLiveTasks } = useProjectProgressContext();

  const handleOptimisticChange = useCallback(
    (optimisticTasks: ProjectTaskRow[]) => {
      setLiveTasks(optimisticTasks);
    },
    [setLiveTasks],
  );

  return (
    <ProjectTasksPanel
      projectId={projectId}
      tasks={tasks}
      canEdit={canEdit}
      undoAvailable={undoAvailable}
      memberOptions={memberOptions}
      labelMemberOptions={labelMemberOptions}
      copy={copy}
      locale={locale}
      onOptimisticTasksChange={handleOptimisticChange}
    />
  );
}
