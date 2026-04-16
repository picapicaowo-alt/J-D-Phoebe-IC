"use client";

import { useOptimistic, useState, useTransition, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { WorkflowNodeLabel, WorkflowNodeStatus } from "@prisma/client";
import {
  addProjectSubtaskAction,
  addProjectTaskAction,
  deleteAllProjectTasksAction,
  deleteProjectTaskAction,
  toggleProjectTaskLeafAction,
  undoLastProjectTaskDeletionAction,
  updateWorkflowNodeMetaAction,
} from "@/app/actions/project-tasks";
import { statusFromAggregatedProgress } from "@/lib/project-task-progress";
import { CloseDialogButton, OpenDialogButton } from "@/components/dialog-launcher";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  EXECUTION_RISK_LABELS,
  PENDING_APPROVAL_LABELS,
  WAITING_LABELS,
  formatWorkflowNodeLabel,
  getApprovalOwnerDisplay,
  getOperationalNextAction,
  getWaitingEscalation,
  getWaitingOnDisplay,
  isAtRiskNode,
  isOverdueNode,
} from "@/lib/workflow-node-operations";

export type ProjectTaskRow = {
  id: string;
  title: string;
  progressPercent: number;
  status: WorkflowNodeStatus;
  assigneeName: string | null;
  assigneeId: string | null;
  dueAt: string | null;
  description: string | null;
  operationalLabels: WorkflowNodeLabel[];
  waitingStartedAt: string | null;
  waitingOnUserId: string | null;
  waitingOnUserName: string | null;
  waitingOnExternalName: string | null;
  waitingDetails: string | null;
  approverId: string | null;
  approverName: string | null;
  approvalRequestedAt: string | null;
  approvalCompletedAt: string | null;
  nextAction: string | null;
  isProjectBottleneck: boolean;
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
  statusLabel: string;
  labelsLabel: string;
  waitingStartedLabel: string;
  waitingOnInternalLabel: string;
  waitingOnExternalLabel: string;
  waitingDetailsLabel: string;
  approvalRequestedLabel: string;
  approvalCompletedLabel: string;
  approverLabel: string;
  nextActionLabel: string;
  bottleneckLabel: string;
  showOperationalFields: string;
  statusOptions: { value: WorkflowNodeStatus; label: string }[];
  labelOptions: { value: WorkflowNodeLabel; label: string }[];
};

type TaskOptimisticAction =
  | { type: "add-root"; row: ProjectTaskRow }
  | { type: "add-sub"; parentId: string; row: ProjectTaskRow }
  | { type: "toggle"; nodeId: string }
  | { type: "delete"; nodeId: string }
  | { type: "clear-all" };

function clampProgressPercent(progressPercent: number) {
  return Math.max(0, Math.min(100, progressPercent));
}

function syncTaskForestRollups(forest: ProjectTaskRow[]): ProjectTaskRow[] {
  return forest.map(syncTaskNodeRollup);
}

function syncTaskNodeRollup(node: ProjectTaskRow): ProjectTaskRow {
  const children = node.children.map(syncTaskNodeRollup);
  if (!children.length) {
    const progressPercent = clampProgressPercent(node.progressPercent);
    return {
      ...node,
      children,
      progressPercent,
    };
  }
  const progressPercent = Math.round(children.reduce((sum, child) => sum + child.progressPercent, 0) / children.length);
  return {
    ...node,
    children,
    progressPercent,
    status: statusFromAggregatedProgress(progressPercent),
  };
}

function findNodeInForest(forest: ProjectTaskRow[], id: string): ProjectTaskRow | null {
  for (const t of forest) {
    if (t.id === id) return t;
    const inner = findNodeInForest(t.children, id);
    if (inner) return inner;
  }
  return null;
}

function collectLeafIdsLocal(node: ProjectTaskRow): string[] {
  if (!node.children.length) return [node.id];
  return node.children.flatMap(collectLeafIdsLocal);
}

function applyDeepToggle(forest: ProjectTaskRow[], leafIds: Set<string>, done: boolean): ProjectTaskRow[] {
  const st: WorkflowNodeStatus = done ? "DONE" : "NOT_STARTED";
  const pct = done ? 100 : 0;
  return forest.map(mapNode);

  function mapNode(t: ProjectTaskRow): ProjectTaskRow {
    const kids = t.children.map(mapNode);
    if (leafIds.has(t.id)) {
      return { ...t, status: st, progressPercent: pct, children: kids };
    }
    if (kids.length) {
      const newPct = Math.round(kids.reduce((s, c) => s + c.progressPercent, 0) / kids.length);
      return { ...t, children: kids, progressPercent: newPct, status: statusFromAggregatedProgress(newPct) };
    }
    return { ...t, children: kids };
  }
}

function addSubToParent(forest: ProjectTaskRow[], parentId: string, row: ProjectTaskRow): ProjectTaskRow[] {
  return forest.map((t) => {
    if (t.id === parentId) return { ...t, children: [...t.children, row] };
    if (t.children.length) return { ...t, children: addSubToParent(t.children, parentId, row) };
    return t;
  });
}

function removeNode(forest: ProjectTaskRow[], nodeId: string): ProjectTaskRow[] {
  const out: ProjectTaskRow[] = [];
  for (const t of forest) {
    if (t.id === nodeId) continue;
    out.push({ ...t, children: removeNode(t.children, nodeId) });
  }
  return out;
}

function applyTasksOptimistic(prev: ProjectTaskRow[], action: TaskOptimisticAction): ProjectTaskRow[] {
  switch (action.type) {
    case "add-root":
      return syncTaskForestRollups([...prev, action.row]);
    case "add-sub":
      return syncTaskForestRollups(addSubToParent(prev, action.parentId, action.row));
    case "toggle": {
      const target = findNodeInForest(prev, action.nodeId);
      if (!target) return prev;
      const leaves = collectLeafIdsLocal(target);
      const leafSet = new Set(leaves);
      const nodes = leaves.map((id) => findNodeInForest(prev, id)).filter(Boolean) as ProjectTaskRow[];
      const allDone = nodes.length > 0 && nodes.every((n) => isComplete(n.status));
      return applyDeepToggle(prev, leafSet, !allDone);
    }
    case "delete":
      return syncTaskForestRollups(removeNode(prev, action.nodeId));
    case "clear-all":
      return [];
    default:
      return prev;
  }
}

function tempOptimId() {
  return `optim:${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

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

function formatWaitAge(waitingStartedAt: string | null) {
  if (!waitingStartedAt) return null;
  const escalation = getWaitingEscalation({
    status: "WAITING",
    operationalLabels: WAITING_LABELS,
    waitingStartedAt: new Date(waitingStartedAt),
  });
  if (!escalation) return null;
  if (escalation.days === 0) return "0d";
  return `${escalation.days}d`;
}

function badgeToneForLabel(label: WorkflowNodeLabel) {
  if (PENDING_APPROVAL_LABELS.includes(label)) return "info" as const;
  if (EXECUTION_RISK_LABELS.includes(label)) return label === "AT_RISK" ? ("warn" as const) : ("bad" as const);
  if (WAITING_LABELS.includes(label)) return "warn" as const;
  return "neutral" as const;
}

function statusTone(status: WorkflowNodeStatus) {
  if (status === "BLOCKED") return "bad" as const;
  if (status === "WAITING") return "warn" as const;
  if (status === "APPROVED" || status === "DONE") return "good" as const;
  if (status === "IN_PROGRESS") return "info" as const;
  return "neutral" as const;
}

function taskSummaryBadges(task: ProjectTaskRow) {
  const labels = task.operationalLabels.slice(0, 3);
  const waitAge = formatWaitAge(task.waitingStartedAt);
  return { labels, waitAge };
}

function TaskOperationalSummary({
  task,
  locale,
}: {
  task: ProjectTaskRow;
  locale: "en" | "zh";
}) {
  const node = {
    status: task.status,
    dueAt: task.dueAt ? new Date(task.dueAt) : null,
    operationalLabels: task.operationalLabels,
    waitingStartedAt: task.waitingStartedAt ? new Date(task.waitingStartedAt) : null,
    waitingOnUser: task.waitingOnUserName ? { name: task.waitingOnUserName } : null,
    waitingOnExternalName: task.waitingOnExternalName,
    waitingDetails: task.waitingDetails,
    approverUser: task.approverName ? { name: task.approverName } : null,
    approvalRequestedAt: task.approvalRequestedAt ? new Date(task.approvalRequestedAt) : null,
    nextAction: task.nextAction,
  };
  const waitingOn = getWaitingOnDisplay(node);
  const approver = getApprovalOwnerDisplay(node);
  const waitEscalation = getWaitingEscalation(node);
  const badges = taskSummaryBadges(task);

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={statusTone(task.status)}>{task.status.replaceAll("_", " ")}</Badge>
        {task.isProjectBottleneck ? <Badge tone="bad">Bottleneck</Badge> : null}
        {labelsToBadges(badges.labels)}
        {waitEscalation ? (
          <Badge tone={waitEscalation.level === "blocked" ? "bad" : waitEscalation.level === "warning" ? "warn" : "neutral"}>
            Waiting {badges.waitAge}
          </Badge>
        ) : null}
        {isOverdueNode(node) ? <Badge tone="bad">Overdue</Badge> : null}
        {isAtRiskNode(node) ? <Badge tone="warn">At Risk</Badge> : null}
      </div>
      {(waitingOn || approver || task.nextAction || task.dueAt) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[hsl(var(--muted))]">
          {waitingOn ? <span>Waiting on {waitingOn}</span> : null}
          {approver ? <span>Approver {approver}</span> : null}
          {task.dueAt ? <span>Due {fmtShortDate(task.dueAt, locale)}</span> : null}
          {task.nextAction ? <span>Next {task.nextAction}</span> : null}
        </div>
      )}
    </div>
  );
}

function labelsToBadges(labels: WorkflowNodeLabel[]) {
  return labels.map((label) => (
    <Badge key={label} tone={badgeToneForLabel(label)}>
      {formatWorkflowNodeLabel(label)}
    </Badge>
  ));
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

function DropdownMenu({
  children,
  buttonContent,
  buttonAriaLabel,
}: {
  children: React.ReactNode;
  buttonContent: React.ReactNode;
  buttonAriaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleOpen() {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + window.scrollY + 4, left: rect.right + window.scrollX });
    }
    setOpen((v) => !v);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="flex h-8 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
        aria-label={buttonAriaLabel ?? "More options"}
        onClick={handleOpen}
      >
        {buttonContent}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "absolute", top: pos.top, left: pos.left, transform: "translateX(-100%)", zIndex: 9999 }}
            className="min-w-[180px] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1 shadow-md"
            onClick={() => setOpen(false)}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
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

type TaskOperationalFormState = {
  status: WorkflowNodeStatus;
  operationalLabels: WorkflowNodeLabel[];
  waitingStartedAt: string | null;
  waitingOnUserId: string | null;
  waitingOnExternalName: string | null;
  waitingDetails: string | null;
  approverId: string | null;
  approvalRequestedAt: string | null;
  approvalCompletedAt: string | null;
  nextAction: string | null;
  isProjectBottleneck: boolean;
};

function TaskOperationalFields({
  copy,
  memberOptions,
  node,
  showStatus = true,
}: {
  copy: ProjectTasksCopy;
  memberOptions: { id: string; name: string }[];
  node: TaskOperationalFormState;
  showStatus?: boolean;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-[hsl(var(--border))] bg-black/5 p-3 dark:bg-white/5">
      {showStatus ? (
        <div className="space-y-1">
          <label className="text-xs font-medium text-[hsl(var(--muted))]">{copy.statusLabel}</label>
          <Select name="status" className="h-10 text-sm" defaultValue={node.status}>
            {copy.statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[hsl(var(--muted))]">{copy.labelsLabel}</label>
        <div className="grid gap-2 md:grid-cols-2">
          {copy.labelOptions.map((option) => (
            <label key={option.value} className="flex items-start gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm">
              <input
                type="checkbox"
                name="operationalLabels"
                value={option.value}
                defaultChecked={node.operationalLabels.includes(option.value)}
                className="mt-0.5"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-[hsl(var(--muted))]">{copy.waitingStartedLabel}</label>
          <Input
            name="waitingStartedAt"
            type="datetime-local"
            defaultValue={isoToDatetimeLocalValue(node.waitingStartedAt)}
            className="text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[hsl(var(--muted))]">{copy.waitingOnInternalLabel}</label>
          <Select name="waitingOnUserId" className="h-10 text-sm" defaultValue={node.waitingOnUserId ?? ""}>
            <option value="">—</option>
            {memberOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[hsl(var(--muted))]">{copy.waitingOnExternalLabel}</label>
          <Input name="waitingOnExternalName" defaultValue={node.waitingOnExternalName ?? ""} className="text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[hsl(var(--muted))]">{copy.approverLabel}</label>
          <Select name="approverUserId" className="h-10 text-sm" defaultValue={node.approverId ?? ""}>
            <option value="">—</option>
            {memberOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[hsl(var(--muted))]">{copy.approvalRequestedLabel}</label>
          <Input
            name="approvalRequestedAt"
            type="datetime-local"
            defaultValue={isoToDatetimeLocalValue(node.approvalRequestedAt)}
            className="text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[hsl(var(--muted))]">{copy.approvalCompletedLabel}</label>
          <Input
            name="approvalCompletedAt"
            type="datetime-local"
            defaultValue={isoToDatetimeLocalValue(node.approvalCompletedAt)}
            className="text-sm"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-[hsl(var(--muted))]">{copy.waitingDetailsLabel}</label>
        <textarea
          name="waitingDetails"
          rows={2}
          defaultValue={node.waitingDetails ?? ""}
          className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[hsl(var(--accent))] focus:ring-2"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-[hsl(var(--muted))]">{copy.nextActionLabel}</label>
        <textarea
          name="nextAction"
          rows={2}
          defaultValue={node.nextAction ?? ""}
          className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[hsl(var(--accent))] focus:ring-2"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
        <input type="checkbox" name="isProjectBottleneck" defaultChecked={node.isProjectBottleneck} />
        {copy.bottleneckLabel}
      </label>
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
  node: { id: string; description: string | null; dueAt: string | null; assigneeId: string | null } & TaskOperationalFormState;
  memberOptions: { id: string; name: string }[];
  copy: ProjectTasksCopy;
}) {
  const router = useRouter();
  const [, startMetaTransition] = useTransition();
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
      <form
        className="max-h-[calc(90vh-100px)] space-y-3 overflow-y-auto p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startMetaTransition(() => {
            void updateWorkflowNodeMetaAction(fd).finally(() => {
              router.refresh();
              (document.getElementById(dialogId) as HTMLDialogElement | null)?.close();
            });
          });
        }}
      >
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
        <TaskOperationalFields copy={copy} memberOptions={memberOptions} node={node} />
        <div className="flex flex-wrap gap-2 pt-1">
          <FormSubmitButton type="submit" className="min-w-[120px]">
            {copy.saveMeta}
          </FormSubmitButton>
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
  onOptimisticTasksChange,
}: {
  projectId: string;
  tasks: ProjectTaskRow[];
  canEdit: boolean;
  undoAvailable: boolean;
  memberOptions: { id: string; name: string }[];
  copy: ProjectTasksCopy;
  locale: "en" | "zh";
  onOptimisticTasksChange?: (tasks: ProjectTaskRow[]) => void;
}) {
  const router = useRouter();
  const [isOtherPending, startOtherTransition] = useTransition();
  const [, startToggleTransition] = useTransition();
  const [optimisticTasks, runOptimistic] = useOptimistic(tasks, applyTasksOptimistic);
  const isBusy = isOtherPending;

  const notifyChange = useCallback(
    (nextTasks: ProjectTaskRow[]) => {
      onOptimisticTasksChange?.(nextTasks);
    },
    [onOptimisticTasksChange],
  );

  useEffect(() => {
    notifyChange(optimisticTasks);
  }, [optimisticTasks, notifyChange]);

  const [open, setOpen] = useState(() => {
    const o: Record<string, boolean> = {};
    for (const t of tasks) {
      if (t.children.length) o[t.id] = true;
    }
    return o;
  });

  return (
    <div
      className={`rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm transition-opacity duration-150 ${
        isBusy ? "opacity-90" : ""
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 shrink-0 rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/15" aria-hidden />
          <h2 className="text-base font-semibold tracking-tight text-[hsl(var(--foreground))]">{copy.title}</h2>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                startOtherTransition(() => {
                  void undoLastProjectTaskDeletionAction(fd).finally(() => router.refresh());
                });
              }}
              title={undoAvailable ? copy.undoHint : copy.undoDisabledHint}
            >
              <input type="hidden" name="projectId" value={projectId} />
              <FormSubmitButton type="submit" variant="secondary" className="h-8 gap-2 px-2.5" disabled={!undoAvailable || isBusy}>
                <IconUndo />
                {copy.undo}
              </FormSubmitButton>
            </form>
            <form
              onSubmit={(e) => {
                if (!window.confirm(copy.confirmDeleteAll)) {
                  e.preventDefault();
                  return;
                }
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                startOtherTransition(() => {
                  runOptimistic({ type: "clear-all" });
                  void deleteAllProjectTasksAction(fd).finally(() => router.refresh());
                });
              }}
            >
              <input type="hidden" name="projectId" value={projectId} />
              <FormSubmitButton type="submit" variant="secondary" className="h-8 gap-2 text-rose-600 dark:text-rose-400" disabled={isBusy}>
                <IconTrash />
                {copy.deleteAll}
              </FormSubmitButton>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                const title = String(fd.get("title") ?? "").trim();
                if (!title) return;
                const assigneeId = String(fd.get("assigneeId") ?? "").trim();
                const assigneeName = assigneeId ? (memberOptions.find((m) => m.id === assigneeId)?.name ?? null) : null;
                const dueRaw = String(fd.get("dueAt") ?? "").trim();
                const dueAt = dueRaw ? new Date(dueRaw).toISOString() : null;
                const waitingStartedRaw = String(fd.get("waitingStartedAt") ?? "").trim();
                const approvalRequestedRaw = String(fd.get("approvalRequestedAt") ?? "").trim();
                const approvalCompletedRaw = String(fd.get("approvalCompletedAt") ?? "").trim();
                const status = (String(fd.get("status") ?? "").trim() || "NOT_STARTED") as WorkflowNodeStatus;
                const operationalLabels = fd.getAll("operationalLabels").map((value) => String(value).trim()) as WorkflowNodeLabel[];
                const waitingOnUserId = String(fd.get("waitingOnUserId") ?? "").trim() || null;
                const approverId = String(fd.get("approverUserId") ?? "").trim() || null;
                startOtherTransition(() => {
                  runOptimistic({
                    type: "add-root",
                    row: {
                      id: tempOptimId(),
                      title,
                      progressPercent: 0,
                      status,
                      assigneeName,
                      assigneeId: assigneeId || null,
                      dueAt,
                      description: null,
                      operationalLabels,
                      waitingStartedAt: waitingStartedRaw ? new Date(waitingStartedRaw).toISOString() : null,
                      waitingOnUserId,
                      waitingOnUserName: waitingOnUserId ? (memberOptions.find((m) => m.id === waitingOnUserId)?.name ?? null) : null,
                      waitingOnExternalName: String(fd.get("waitingOnExternalName") ?? "").trim() || null,
                      waitingDetails: String(fd.get("waitingDetails") ?? "").trim() || null,
                      approverId,
                      approverName: approverId ? (memberOptions.find((m) => m.id === approverId)?.name ?? null) : null,
                      approvalRequestedAt: approvalRequestedRaw ? new Date(approvalRequestedRaw).toISOString() : null,
                      approvalCompletedAt: approvalCompletedRaw ? new Date(approvalCompletedRaw).toISOString() : null,
                      nextAction: String(fd.get("nextAction") ?? "").trim() || null,
                      isProjectBottleneck: String(fd.get("isProjectBottleneck") ?? "").trim() === "on",
                      children: [],
                    },
                  });
                  void addProjectTaskAction(fd).finally(() => router.refresh());
                });
                form.reset();
              }}
              className="space-y-2"
            >
              <input type="hidden" name="projectId" value={projectId} />
              <div className="flex flex-wrap items-center gap-2">
                <Input name="title" required placeholder={copy.newTaskPh} className="h-8 w-40 text-sm md:w-52" />
                <Select name="status" className="h-8 max-w-[160px] text-xs" defaultValue="NOT_STARTED">
                  {copy.statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Select name="assigneeId" className="h-8 max-w-[160px] text-xs" defaultValue="">
                  <option value="">—</option>
                  {memberOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
                <label className="flex min-w-[140px] flex-col gap-0.5 text-xs text-[hsl(var(--muted))]">
                  {copy.deadlineOptional}
                  <Input name="dueAt" type="datetime-local" className="h-8 text-xs" />
                </label>
                <FormSubmitButton type="submit" variant="secondary" className="h-8 gap-1.5 px-3" disabled={isBusy}>
                  <IconPlus />
                  {copy.addTask}
                </FormSubmitButton>
              </div>
              <details className="rounded-lg border border-[hsl(var(--border))] bg-black/5 p-2 dark:bg-white/5">
                <summary className="cursor-pointer text-xs font-medium text-[hsl(var(--muted))]">{copy.showOperationalFields}</summary>
                <div className="mt-2">
                  <TaskOperationalFields
                    copy={copy}
                    memberOptions={memberOptions}
                    showStatus={false}
                    node={{
                      status: "NOT_STARTED",
                      operationalLabels: [],
                      waitingStartedAt: null,
                      waitingOnUserId: null,
                      waitingOnExternalName: null,
                      waitingDetails: null,
                      approverId: null,
                      approvalRequestedAt: null,
                      approvalCompletedAt: null,
                      nextAction: null,
                      isProjectBottleneck: false,
                    }}
                  />
                </div>
              </details>
            </form>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 p-4">
        {!optimisticTasks.length ? (
          <p className="text-sm text-[hsl(var(--muted))]">{copy.empty}</p>
        ) : (
          optimisticTasks.map((task) => {
            const expanded = open[task.id] ?? false;
            const hasKids = task.children.length > 0;
            const taskDialogId = `task-meta-${task.id}`;
            const taskDone = isComplete(task.status);
            return (
              <div key={task.id} id={`task-${task.id}`} className="rounded-[10px] border border-[hsl(var(--border))] p-px">
                <div className="flex flex-wrap items-center gap-3 px-3 py-3 md:flex-nowrap">
                  {canEdit ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        startToggleTransition(() => {
                          runOptimistic({ type: "toggle", nodeId: task.id });
                          void toggleProjectTaskLeafAction(fd).finally(() => router.refresh());
                        });
                      }}
                      className="shrink-0"
                    >
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
                    <TaskOperationalSummary task={task} locale={locale} />
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular-nums text-[hsl(var(--foreground))]">{task.progressPercent}%</span>
                    <ProgressTrack pct={task.progressPercent} thick />
                  </div>
                  {canEdit ? (
                    <DropdownMenu buttonContent={<IconMore />}>
                      <OpenDialogButton
                        dialogId={taskDialogId}
                        className="flex h-8 w-full items-center rounded-md px-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        {copy.editDetails}
                      </OpenDialogButton>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const fd = new FormData(e.currentTarget);
                          startToggleTransition(() => {
                            runOptimistic({ type: "delete", nodeId: task.id });
                            void deleteProjectTaskAction(fd).finally(() => router.refresh());
                          });
                        }}
                      >
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="nodeId" value={task.id} />
                        <FormSubmitButton type="submit" variant="ghost" className="h-8 w-full justify-start text-sm text-rose-600">
                          {copy.deleteTask}
                        </FormSubmitButton>
                      </form>
                    </DropdownMenu>
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
                      status: task.status,
                      operationalLabels: task.operationalLabels,
                      waitingStartedAt: task.waitingStartedAt,
                      waitingOnUserId: task.waitingOnUserId,
                      waitingOnExternalName: task.waitingOnExternalName,
                      waitingDetails: task.waitingDetails,
                      approverId: task.approverId,
                      approvalRequestedAt: task.approvalRequestedAt,
                      approvalCompletedAt: task.approvalCompletedAt,
                      nextAction: task.nextAction,
                      isProjectBottleneck: task.isProjectBottleneck,
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
                        <div key={sub.id} id={`task-${sub.id}`}>
                          <div className="flex flex-wrap items-center gap-3 rounded-[10px] bg-slate-50 px-3 py-3 dark:bg-zinc-900/60 sm:ml-16 lg:ml-24 md:flex-nowrap">
                            {canEdit ? (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const fd = new FormData(e.currentTarget);
                                  startToggleTransition(() => {
                                    runOptimistic({ type: "toggle", nodeId: sub.id });
                                    void toggleProjectTaskLeafAction(fd).finally(() => router.refresh());
                                  });
                                }}
                                className="shrink-0"
                              >
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
                              <TaskOperationalSummary task={sub} locale={locale} />
                            </div>
                            <span className="shrink-0 text-sm font-semibold tabular-nums">{sub.progressPercent}%</span>
                            <div className="w-24 shrink-0">
                              <ProgressTrack pct={sub.progressPercent} />
                            </div>
                            {canEdit ? (
                              <DropdownMenu buttonContent={<IconMore />}>
                                <OpenDialogButton
                                  dialogId={subDialogId}
                                  className="flex h-8 w-full items-center rounded-md px-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
                                >
                                  {copy.editDetails}
                                </OpenDialogButton>
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    const fd = new FormData(e.currentTarget);
                                    startToggleTransition(() => {
                                      runOptimistic({ type: "delete", nodeId: sub.id });
                                      void deleteProjectTaskAction(fd).finally(() => router.refresh());
                                    });
                                  }}
                                >
                                  <input type="hidden" name="projectId" value={projectId} />
                                  <input type="hidden" name="nodeId" value={sub.id} />
                                  <FormSubmitButton type="submit" variant="ghost" className="h-8 w-full justify-start text-sm text-rose-600">
                                    {copy.deleteTask}
                                  </FormSubmitButton>
                                </form>
                              </DropdownMenu>
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
                                status: sub.status,
                                operationalLabels: sub.operationalLabels,
                                waitingStartedAt: sub.waitingStartedAt,
                                waitingOnUserId: sub.waitingOnUserId,
                                waitingOnExternalName: sub.waitingOnExternalName,
                                waitingDetails: sub.waitingDetails,
                                approverId: sub.approverId,
                                approvalRequestedAt: sub.approvalRequestedAt,
                                approvalCompletedAt: sub.approvalCompletedAt,
                                nextAction: sub.nextAction,
                                isProjectBottleneck: sub.isProjectBottleneck,
                              }}
                              memberOptions={memberOptions}
                              copy={copy}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                    {canEdit ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const form = e.currentTarget;
                          const fd = new FormData(form);
                          const title = String(fd.get("title") ?? "").trim();
                          if (!title) return;
                          const assigneeId = String(fd.get("assigneeId") ?? "").trim();
                          const assigneeName = assigneeId ? (memberOptions.find((m) => m.id === assigneeId)?.name ?? null) : null;
                          const dueRaw = String(fd.get("dueAt") ?? "").trim();
                          const dueAt = dueRaw ? new Date(dueRaw).toISOString() : null;
                          const waitingStartedRaw = String(fd.get("waitingStartedAt") ?? "").trim();
                          const approvalRequestedRaw = String(fd.get("approvalRequestedAt") ?? "").trim();
                          const approvalCompletedRaw = String(fd.get("approvalCompletedAt") ?? "").trim();
                          const status = (String(fd.get("status") ?? "").trim() || "NOT_STARTED") as WorkflowNodeStatus;
                          const operationalLabels = fd.getAll("operationalLabels").map((value) => String(value).trim()) as WorkflowNodeLabel[];
                          const waitingOnUserId = String(fd.get("waitingOnUserId") ?? "").trim() || null;
                          const approverId = String(fd.get("approverUserId") ?? "").trim() || null;
                          startOtherTransition(() => {
                            runOptimistic({
                              type: "add-sub",
                              parentId: task.id,
                              row: {
                                id: tempOptimId(),
                                title,
                                progressPercent: 0,
                                status,
                                assigneeName,
                                assigneeId: assigneeId || null,
                                dueAt,
                                description: null,
                                operationalLabels,
                                waitingStartedAt: waitingStartedRaw ? new Date(waitingStartedRaw).toISOString() : null,
                                waitingOnUserId,
                                waitingOnUserName: waitingOnUserId ? (memberOptions.find((m) => m.id === waitingOnUserId)?.name ?? null) : null,
                                waitingOnExternalName: String(fd.get("waitingOnExternalName") ?? "").trim() || null,
                                waitingDetails: String(fd.get("waitingDetails") ?? "").trim() || null,
                                approverId,
                                approverName: approverId ? (memberOptions.find((m) => m.id === approverId)?.name ?? null) : null,
                                approvalRequestedAt: approvalRequestedRaw ? new Date(approvalRequestedRaw).toISOString() : null,
                                approvalCompletedAt: approvalCompletedRaw ? new Date(approvalCompletedRaw).toISOString() : null,
                                nextAction: String(fd.get("nextAction") ?? "").trim() || null,
                                isProjectBottleneck: String(fd.get("isProjectBottleneck") ?? "").trim() === "on",
                                children: [],
                              },
                            });
                            void addProjectSubtaskAction(fd).finally(() => router.refresh());
                          });
                          form.reset();
                        }}
                        className="space-y-2 pt-1 sm:ml-16 lg:ml-24"
                      >
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="parentNodeId" value={task.id} />
                        <div className="flex flex-wrap items-center gap-2">
                          <Input name="title" required placeholder={copy.newSubPh} className="h-8 max-w-[200px] flex-1 text-sm" />
                          <Select name="status" className="h-8 max-w-[160px] text-xs" defaultValue="NOT_STARTED">
                            {copy.statusOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
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
                          <FormSubmitButton type="submit" variant="secondary" className="h-8" disabled={isBusy}>
                            {copy.addSubtask}
                          </FormSubmitButton>
                        </div>
                        <details className="rounded-lg border border-[hsl(var(--border))] bg-black/5 p-2 dark:bg-white/5">
                          <summary className="cursor-pointer text-xs font-medium text-[hsl(var(--muted))]">
                            {copy.showOperationalFields}
                          </summary>
                          <div className="mt-2">
                            <TaskOperationalFields
                              copy={copy}
                              memberOptions={memberOptions}
                              showStatus={false}
                              node={{
                                status: "NOT_STARTED",
                                operationalLabels: [],
                                waitingStartedAt: null,
                                waitingOnUserId: null,
                                waitingOnExternalName: null,
                                waitingDetails: null,
                                approverId: null,
                                approvalRequestedAt: null,
                                approvalCompletedAt: null,
                                nextAction: null,
                                isProjectBottleneck: false,
                              }}
                            />
                          </div>
                        </details>
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
