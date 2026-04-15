"use client";

import { useState } from "react";
import type { WorkflowNodeStatus } from "@prisma/client";
import {
  addProjectSubtaskAction,
  addProjectTaskAction,
  deleteAllProjectTasksAction,
  deleteProjectTaskAction,
  toggleProjectTaskLeafAction,
  undoLastProjectTaskDeletionAction,
  updateWorkflowNodeMetaAction,
} from "@/app/actions/project-tasks";
import { CloseDialogButton, OpenDialogButton } from "@/components/dialog-launcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export type ProjectTaskRow = {
  id: string;
  title: string;
  progressPercent: number;
  status: WorkflowNodeStatus;
  assigneeName: string | null;
  assigneeId: string | null;
  dueAt: string | null;
  description: string | null;
  children: ProjectTaskRow[];
};

export type ProjectTasksCopy = {
  title: string;
  undo: string;
  undoHint: string;
  undoDisabledHint: string;
  deleteAll: string;
  deleteTask: string;
  addTask: string;
  addSubtask: string;
  assignedPrefix: string;
  confirmDeleteAll: string;
  empty: string;
  noSubtasksHint: string;
  newTaskPh: string;
  newSubPh: string;
  deadlineOptional: string;
  assignSubOptional: string;
  metaTitle: string;
  metaLead: string;
  saveMeta: string;
  dueShort: string;
  descriptionLabel: string;
  editDetails: string;
  dialogClose: string;
};

function isoToDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtShortDate(iso: string | null, locale: "en" | "zh") {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-GB", { year: "numeric", month: "short", day: "numeric" });
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M8 5l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 4h8M6 4V3h4v1M6 7v4M10 7v4M5 4l1 9h4l1-9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUndo() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 7a5 5 0 119 2M3 7V4m0 3h3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMore() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <circle cx="8" cy="3" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="8" cy="13" r="1.5" />
    </svg>
  );
}

function isComplete(status: WorkflowNodeStatus) {
  return status === "DONE" || status === "SKIPPED";
}

function ProgressTrack({ pct, thick = false }: { pct: number; thick?: boolean }) {
  const w = Math.max(0, Math.min(100, pct));
  const h = thick ? "h-2" : "h-1.5";
  return (
    <div className={`w-full max-w-[128px] overflow-hidden rounded-full bg-[rgba(3,2,19,0.2)] dark:bg-white/20 ${h}`}>
      <div className={`h-full rounded-full bg-zinc-900 dark:bg-zinc-100`} style={{ width: `${w}%` }} />
    </div>
  );
}

function NodeMetaDialog({
  dialogId,
  projectId,
  node,
  memberOptions,
  copy,
}: {
  dialogId: string;
  projectId: string;
  node: { id: string; description: string | null; dueAt: string | null; assigneeId: string | null };
  memberOptions: { id: string; name: string }[];
  copy: ProjectTasksCopy;
}) {
  return (
    <dialog
      id={dialogId}
      className="app-modal-dialog z-50 max-h-[min(90vh,640px)] w-[min(100vw-2rem,480px)] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0 shadow-2xl backdrop:bg-black/40"
    >
      <div className="flex items-start justify-between gap-2 border-b border-[hsl(var(--border))] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">{copy.metaTitle}</h3>
          <p className="text-xs text-[hsl(var(--muted))]">{copy.metaLead}</p>
        </div>
        <CloseDialogButton
          dialogId={dialogId}
          className="rounded-lg px-2 py-1 text-xs text-[hsl(var(--muted))] hover:bg-black/5 dark:hover:bg-white/10"
          label={copy.dialogClose}
        />
      </div>
      <form action={updateWorkflowNodeMetaAction} className="max-h-[calc(90vh-100px)] space-y-3 overflow-y-auto p-4">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="nodeId" value={node.id} />
        <div className="space-y-1">
          <label className="text-xs font-medium text-[hsl(var(--muted))]">{copy.descriptionLabel}</label>
          <textarea
            name="description"
            rows={4}
            defaultValue={node.description ?? ""}
            className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[hsl(var(--accent))] focus:ring-2"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[hsl(var(--muted))]">{copy.deadlineOptional}</label>
          <Input name="dueAt" type="datetime-local" defaultValue={isoToDatetimeLocalValue(node.dueAt)} className="text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[hsl(var(--muted))]">{copy.assignSubOptional}</label>
          <Select name="assigneeId" className="h-10 text-sm" defaultValue={node.assigneeId ?? ""}>
            <option value="">—</option>
            {memberOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" className="min-w-[120px]">
            {copy.saveMeta}
          </Button>
          <CloseDialogButton
            dialogId={dialogId}
            className="rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
            label={copy.dialogClose}
          />
        </div>
      </form>
    </dialog>
  );
}

export function ProjectTasksPanel({
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
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    for (const t of tasks) {
      if (t.children.length) o[t.id] = true;
    }
    return o;
  });

  return (
    <div className="overflow-hidden rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 shrink-0 rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/15" aria-hidden />
          <h2 className="text-base font-semibold tracking-tight text-[hsl(var(--foreground))]">{copy.title}</h2>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <form action={undoLastProjectTaskDeletionAction} title={undoAvailable ? copy.undoHint : copy.undoDisabledHint}>
              <input type="hidden" name="projectId" value={projectId} />
              <Button type="submit" variant="secondary" className="h-8 gap-2 px-2.5" disabled={!undoAvailable}>
                <IconUndo />
                {copy.undo}
              </Button>
            </form>
            <form
              action={deleteAllProjectTasksAction}
              onSubmit={(e) => {
                if (!window.confirm(copy.confirmDeleteAll)) e.preventDefault();
              }}
            >
              <input type="hidden" name="projectId" value={projectId} />
              <Button type="submit" variant="secondary" className="h-8 gap-2 text-rose-600 dark:text-rose-400">
                <IconTrash />
                {copy.deleteAll}
              </Button>
            </form>
            <form action={addProjectTaskAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="projectId" value={projectId} />
              <Select name="assigneeId" className="h-8 max-w-[160px] text-xs" defaultValue="">
                <option value="">—</option>
                {memberOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
              <Input name="title" required placeholder={copy.newTaskPh} className="h-8 w-40 text-sm md:w-52" />
              <label className="flex min-w-[140px] flex-col gap-0.5 text-xs text-[hsl(var(--muted))]">
                {copy.deadlineOptional}
                <Input name="dueAt" type="datetime-local" className="h-8 text-xs" />
              </label>
              <Button type="submit" variant="secondary" className="h-8 gap-1.5 px-3">
                <IconPlus />
                {copy.addTask}
              </Button>
            </form>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 p-4">
        {!tasks.length ? (
          <p className="text-sm text-[hsl(var(--muted))]">{copy.empty}</p>
        ) : (
          tasks.map((task) => {
            const expanded = open[task.id] ?? false;
            const hasKids = task.children.length > 0;
            const taskDialogId = `task-meta-${task.id}`;
            const taskDone = isComplete(task.status);
            return (
              <div key={task.id} className="rounded-[10px] border border-[hsl(var(--border))] p-px">
                <div className="flex flex-wrap items-center gap-3 px-3 py-3 md:flex-nowrap">
                  {canEdit ? (
                    <form action={toggleProjectTaskLeafAction} className="shrink-0">
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="nodeId" value={task.id} />
                      <button
                        type="submit"
                        className={`flex h-4 w-4 items-center justify-center rounded border shadow-sm ${
                          taskDone
                            ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                            : "border-[hsl(var(--border))] bg-[hsl(var(--card))]"
                        }`}
                        aria-label={taskDone ? "Mark task and subtasks incomplete" : "Mark task and subtasks complete"}
                      >
                        {taskDone ? (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                            <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        ) : null}
                      </button>
                    </form>
                  ) : (
                    <span
                      className={`h-4 w-4 shrink-0 rounded border ${
                        taskDone ? "border-zinc-900 bg-zinc-900 dark:border-zinc-100 dark:bg-zinc-100" : "border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10"
                      }`}
                      aria-hidden
                    />
                  )}
                  <button
                    type="button"
                    className="flex h-8 w-10 shrink-0 items-center justify-center rounded-lg text-[hsl(var(--foreground))] hover:bg-black/5 dark:hover:bg-white/10"
                    aria-expanded={expanded}
                    aria-label={expanded ? "Collapse subtasks" : "Expand subtasks"}
                    onClick={() => setOpen((s) => ({ ...s, [task.id]: !expanded }))}
                  >
                    {expanded ? <ChevronDown /> : <ChevronRight />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold leading-7 tracking-tight text-[hsl(var(--foreground))]">{task.title}</p>
                    <p className="text-sm text-[hsl(var(--muted))]">
                      {copy.assignedPrefix} {task.assigneeName ?? "—"}
                    </p>
                    {task.dueAt ? (
                      <p className="mt-0.5 text-xs text-[hsl(var(--muted))]">
                        {copy.dueShort}: {fmtShortDate(task.dueAt, locale)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular-nums text-[hsl(var(--foreground))]">{task.progressPercent}%</span>
                    <ProgressTrack pct={task.progressPercent} thick />
                  </div>
                  {canEdit ? (
                    <details className="relative shrink-0">
                      <summary className="flex h-8 w-9 cursor-pointer list-none items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 [&::-webkit-details-marker]:hidden">
                        <IconMore />
                      </summary>
                      <div className="absolute right-0 z-10 mt-1 min-w-[180px] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1 shadow-md">
                        <OpenDialogButton
                          dialogId={taskDialogId}
                          className="flex h-8 w-full items-center rounded-md px-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          {copy.editDetails}
                        </OpenDialogButton>
                        <form action={deleteProjectTaskAction}>
                          <input type="hidden" name="projectId" value={projectId} />
                          <input type="hidden" name="nodeId" value={task.id} />
                          <Button type="submit" variant="ghost" className="h-8 w-full justify-start text-sm text-rose-600">
                            {copy.deleteTask}
                          </Button>
                        </form>
                      </div>
                    </details>
                  ) : null}
                </div>
                {canEdit ? (
                  <NodeMetaDialog
                    dialogId={taskDialogId}
                    projectId={projectId}
                    node={{
                      id: task.id,
                      description: task.description,
                      dueAt: task.dueAt,
                      assigneeId: task.assigneeId,
                    }}
                    memberOptions={memberOptions}
                    copy={copy}
                  />
                ) : null}

                {expanded ? (
                  <div className="space-y-2 border-t border-[hsl(var(--border))] px-3 pb-3 pt-2">
                    {hasKids ? null : <p className="text-xs text-[hsl(var(--muted))]">{copy.noSubtasksHint}</p>}
                    {task.children.map((sub) => {
                      const done = isComplete(sub.status);
                      const subDialogId = `task-meta-${sub.id}`;
                      return (
                        <div key={sub.id}>
                          <div className="flex flex-wrap items-center gap-3 rounded-[10px] bg-slate-50 px-3 py-3 dark:bg-zinc-900/60 md:flex-nowrap">
                            {canEdit ? (
                              <form action={toggleProjectTaskLeafAction} className="shrink-0">
                                <input type="hidden" name="projectId" value={projectId} />
                                <input type="hidden" name="nodeId" value={sub.id} />
                                <button
                                  type="submit"
                                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border shadow-sm ${
                                    done
                                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                                      : "border-[hsl(var(--border))] bg-[hsl(var(--card))]"
                                  }`}
                                  aria-label={done ? "Mark incomplete" : "Mark complete"}
                                >
                                  {done ? (
                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                                      <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                    </svg>
                                  ) : null}
                                </button>
                              </form>
                            ) : (
                              <span
                                className={`h-4 w-4 shrink-0 rounded border ${
                                  done ? "border-zinc-900 bg-zinc-900 dark:border-zinc-100 dark:bg-zinc-100" : "border-[hsl(var(--border))]"
                                }`}
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <span
                                className={`text-base font-medium ${
                                  done ? "text-[#90a1b9] line-through dark:text-zinc-500" : "text-[hsl(var(--foreground))]"
                                }`}
                              >
                                {sub.title}
                              </span>
                              <p className="text-xs text-[hsl(var(--muted))]">
                                {copy.assignedPrefix} {sub.assigneeName ?? "—"}
                              </p>
                              {sub.dueAt ? (
                                <p className="text-xs text-[hsl(var(--muted))]">
                                  {copy.dueShort}: {fmtShortDate(sub.dueAt, locale)}
                                </p>
                              ) : null}
                            </div>
                            <span className="shrink-0 text-sm font-semibold tabular-nums">{sub.progressPercent}%</span>
                            <div className="w-24 shrink-0">
                              <ProgressTrack pct={sub.progressPercent} />
                            </div>
                            {canEdit ? (
                              <details className="relative shrink-0">
                                <summary className="flex h-8 w-9 cursor-pointer list-none items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 [&::-webkit-details-marker]:hidden">
                                  <IconMore />
                                </summary>
                                <div className="absolute right-0 z-10 mt-1 min-w-[160px] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1 shadow-md">
                                  <OpenDialogButton
                                    dialogId={subDialogId}
                                    className="flex h-8 w-full items-center rounded-md px-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
                                  >
                                    {copy.editDetails}
                                  </OpenDialogButton>
                                  <form action={deleteProjectTaskAction}>
                                    <input type="hidden" name="projectId" value={projectId} />
                                    <input type="hidden" name="nodeId" value={sub.id} />
                                    <Button type="submit" variant="ghost" className="h-8 w-8 shrink-0 p-0 text-[hsl(var(--muted))] hover:text-rose-600">
                                      <IconTrash />
                                    </Button>
                                  </form>
                                </div>
                              </details>
                            ) : null}
                          </div>
                          {canEdit ? (
                            <NodeMetaDialog
                              dialogId={subDialogId}
                              projectId={projectId}
                              node={{
                                id: sub.id,
                                description: sub.description,
                                dueAt: sub.dueAt,
                                assigneeId: sub.assigneeId,
                              }}
                              memberOptions={memberOptions}
                              copy={copy}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                    {canEdit ? (
                      <form action={addProjectSubtaskAction} className="flex flex-wrap items-center gap-2 pt-1">
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="parentNodeId" value={task.id} />
                        <Input name="title" required placeholder={copy.newSubPh} className="h-8 max-w-[200px] flex-1 text-sm" />
                        <Select name="assigneeId" className="h-8 max-w-[160px] text-xs" defaultValue="">
                          <option value="">—</option>
                          {memberOptions.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </Select>
                        <label className="flex flex-col gap-0.5 text-xs text-[hsl(var(--muted))]">
                          {copy.deadlineOptional}
                          <Input name="dueAt" type="datetime-local" className="h-8 text-xs" />
                        </label>
                        <Button type="submit" variant="secondary" className="h-8">
                          {copy.addSubtask}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
