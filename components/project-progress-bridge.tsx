"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ProjectStatus } from "@prisma/client";
import { ProjectTasksPanel, type ProjectTaskRow, type ProjectTasksCopy } from "@/components/project-tasks-panel";
import { tProjectStatus } from "@/lib/messages";
import type { Locale } from "@/lib/locale";

type ProjectProgressContextValue = {
  liveTasks: ProjectTaskRow[];
  setLiveTasks: (tasks: ProjectTaskRow[]) => void;
  liveProjectCompleted: boolean;
  setLiveProjectCompleted: (projectCompleted: boolean) => void;
  fallbackProgressPercent: number;
};

const ProjectProgressContext = createContext<ProjectProgressContextValue | null>(null);

function clampProgressPercent(progressPercent: number) {
  return Math.max(0, Math.min(100, progressPercent));
}

function computeOverallProgress(tasks: ProjectTaskRow[], fallbackProgressPercent: number, projectCompleted: boolean): number {
  if (!tasks.length) {
    return projectCompleted ? 100 : clampProgressPercent(fallbackProgressPercent);
  }

  function nodeProgress(task: ProjectTaskRow): number {
    if (!task.children.length) return clampProgressPercent(task.progressPercent);
    const childValues = task.children.map(nodeProgress);
    return Math.round(childValues.reduce((sum, value) => sum + value, 0) / childValues.length);
  }

  const rootValues = tasks.map(nodeProgress);
  return Math.round(rootValues.reduce((sum, value) => sum + value, 0) / rootValues.length);
}

function computeLiveProjectCompleted(tasks: ProjectTaskRow[], explicitProjectCompleted: boolean): boolean {
  if (!tasks.length) return explicitProjectCompleted;
  return computeOverallProgress(tasks, 0, false) >= 100;
}

function computeLiveProjectStatus(baseStatus: ProjectStatus, tasks: ProjectTaskRow[], explicitProjectCompleted: boolean): ProjectStatus {
  const complete = computeLiveProjectCompleted(tasks, explicitProjectCompleted);
  if (complete) return "COMPLETED";
  if (baseStatus === "COMPLETED") return "ACTIVE";
  return baseStatus;
}

function useProjectProgressState(initialTasks: ProjectTaskRow[], fallbackProgressPercent: number, projectCompleted: boolean) {
  const [liveTasks, setLiveTasks] = useState(initialTasks);
  const [liveProjectCompleted, setLiveProjectCompleted] = useState(projectCompleted);

  useEffect(() => {
    setLiveTasks(initialTasks);
  }, [initialTasks]);

  useEffect(() => {
    setLiveProjectCompleted(projectCompleted);
  }, [projectCompleted]);

  return useMemo(
    () => ({
      liveTasks,
      setLiveTasks,
      liveProjectCompleted,
      setLiveProjectCompleted,
      fallbackProgressPercent,
    }),
    [fallbackProgressPercent, liveProjectCompleted, liveTasks],
  );
}

function useProjectProgressContext() {
  const value = useContext(ProjectProgressContext);
  if (!value) throw new Error("Project progress components must be wrapped in ProjectProgressProvider.");
  return value;
}

export function ProjectProgressProvider({
  initialTasks,
  fallbackProgressPercent,
  projectCompleted,
  children,
}: {
  initialTasks: ProjectTaskRow[];
  fallbackProgressPercent: number;
  projectCompleted: boolean;
  children: React.ReactNode;
}) {
  const value = useProjectProgressState(initialTasks, fallbackProgressPercent, projectCompleted);
  return <ProjectProgressContext.Provider value={value}>{children}</ProjectProgressContext.Provider>;
}

export function ProjectProgressDisplay() {
  const { liveTasks, liveProjectCompleted, fallbackProgressPercent } = useProjectProgressContext();
  const pct = computeOverallProgress(liveTasks, fallbackProgressPercent, liveProjectCompleted);
  return <p className="text-sm font-semibold tabular-nums text-[hsl(var(--foreground))]">{pct}%</p>;
}

export function ProjectProgressBar() {
  const { liveTasks, liveProjectCompleted, fallbackProgressPercent } = useProjectProgressContext();
  const pct = computeOverallProgress(liveTasks, fallbackProgressPercent, liveProjectCompleted);
  const width = clampProgressPercent(pct);

  return (
    <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[rgba(3,2,19,0.2)] dark:bg-white/20">
      <div className="h-full rounded-full bg-zinc-900 dark:bg-zinc-100 transition-[width] duration-300" style={{ width: `${width}%` }} />
    </div>
  );
}

export function ProjectLiveStatusText({ baseStatus, locale }: { baseStatus: ProjectStatus; locale: Locale }) {
  const { liveTasks, liveProjectCompleted } = useProjectProgressContext();
  const liveStatus = computeLiveProjectStatus(baseStatus, liveTasks, liveProjectCompleted);
  return <>{tProjectStatus(locale, liveStatus)}</>;
}

export function ProjectLiveStatusDot({ baseStatus }: { baseStatus: ProjectStatus }) {
  const { liveTasks, liveProjectCompleted } = useProjectProgressContext();
  const liveStatus = computeLiveProjectStatus(baseStatus, liveTasks, liveProjectCompleted);
  const tone =
    liveStatus === "ACTIVE" ? "bg-emerald-500" : liveStatus === "COMPLETED" ? "bg-sky-500" : "bg-zinc-400 dark:bg-zinc-500";
  return <span className={`h-2 w-2 shrink-0 rounded-full ${tone}`} aria-hidden />;
}

export function ProjectTasksPanelWithProgress({
  projectId,
  tasks,
  projectCompleted,
  canToggleProjectCompletion,
  canEdit,
  undoAvailable,
  memberOptions,
  labelMemberOptions,
  copy,
  locale,
}: {
  projectId: string;
  tasks: ProjectTaskRow[];
  projectCompleted: boolean;
  canToggleProjectCompletion: boolean;
  canEdit: boolean;
  undoAvailable: boolean;
  memberOptions: { id: string; name: string }[];
  labelMemberOptions: { id: string; name: string }[];
  copy: ProjectTasksCopy;
  locale: "en" | "zh";
}) {
  const { setLiveProjectCompleted, setLiveTasks } = useProjectProgressContext();

  const handleOptimisticChange = useCallback(
    (optimisticTasks: ProjectTaskRow[]) => {
      setLiveTasks(optimisticTasks);
    },
    [setLiveTasks],
  );

  const handleProjectCompletedChange = useCallback(
    (nextProjectCompleted: boolean) => {
      setLiveProjectCompleted(nextProjectCompleted);
    },
    [setLiveProjectCompleted],
  );

  return (
    <ProjectTasksPanel
      projectId={projectId}
      tasks={tasks}
      projectCompleted={projectCompleted}
      canToggleProjectCompletion={canToggleProjectCompletion}
      canEdit={canEdit}
      undoAvailable={undoAvailable}
      memberOptions={memberOptions}
      labelMemberOptions={labelMemberOptions}
      copy={copy}
      locale={locale}
      onOptimisticTasksChange={handleOptimisticChange}
      onProjectCompletedChange={handleProjectCompletedChange}
    />
  );
}
