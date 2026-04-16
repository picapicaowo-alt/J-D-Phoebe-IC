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
  updateWorkflowNodeDetailsAction,
  updateWorkflowNodeOperationalAction,
} from "@/app/actions/project-tasks";
import { statusFromAggregatedProgress } from "@/lib/project-task-progress";
import { CloseDialogButton, OpenDialogButton } from "@/components/dialog-launcher";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  APPROVAL_OUTCOME_LABELS,
  EXECUTION_RISK_LABELS,
  PENDING_APPROVAL_LABELS,
  WAITING_LABELS,
  isAtRiskNode,
  isBlockedNode,
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
  waitingOnUserIds: string[];
  waitingOnUserNames: string[];
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
  labelsTitle: string;
  labelsLead: string;
  saveMeta: string;
  dueShort: string;
  descriptionLabel: string;
  editDetails: string;
  editLabels: string;
  dialogClose: string;
  statusLabel: string;
  labelsLabel: string;
  categoryLabel: string;
  waitingStartedLabel: string;
  waitingOnInternalLabel: string;
  waitingOnExternalLabel: string;
  waitingDetailsLabel: string;
  approvalRequestedLabel: string;
  approvalCompletedLabel: string;
  approverLabel: string;
  nextActionLabel: string;
  bottleneckLabel: string;
  statusOptions: { value: WorkflowNodeStatus; label: string }[];
  labelOptions: { value: WorkflowNodeLabel; label: string }[];
  labelGroupWaiting: string;
  labelGroupApproval: string;
  labelGroupRisk: string;
  mentionPlaceholder: string;
  peoplePickerPlaceholder: string;
  peoplePickerSearchPlaceholder: string;
  peoplePickerEmpty: string;
  externalPlaceholder: string;
  waitingDetailsPlaceholder: string;
  nextActionPlaceholder: string;
  summaryWaiting: string;
  summaryApproval: string;
  summaryRisk: string;
  summaryBottleneck: string;
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

function statusTone(status: WorkflowNodeStatus) {
  if (status === "BLOCKED") return "bad" as const;
  if (status === "WAITING") return "warn" as const;
  if (status === "APPROVED" || status === "DONE") return "good" as const;
  if (status === "IN_PROGRESS") return "info" as const;
  return "neutral" as const;
}

function hasWaitingOperationalData(task: TaskOperationalFormState) {
  return !!(task.waitingStartedAt || task.waitingOnUserIds.length || task.waitingOnExternalName || task.waitingDetails);
}

function hasApprovalOperationalData(task: Pick<TaskOperationalFormState, "approverId" | "approvalRequestedAt" | "approvalCompletedAt">) {
  return !!(task.approverId || task.approvalRequestedAt || task.approvalCompletedAt);
}

function hasRiskOperationalData(task: Pick<TaskOperationalFormState, "nextAction" | "isProjectBottleneck">) {
  return !!(task.nextAction || task.isProjectBottleneck);
}

function TaskOperationalSummary({ task, copy }: { task: ProjectTaskRow; copy: ProjectTasksCopy }) {
  const node = {
    status: task.status,
    dueAt: task.dueAt ? new Date(task.dueAt) : null,
    operationalLabels: task.operationalLabels,
    waitingStartedAt: task.waitingStartedAt ? new Date(task.waitingStartedAt) : null,
    waitingOnUsers: task.waitingOnUserNames.map((name) => ({ name })),
    waitingOnUser: task.waitingOnUserName ? { name: task.waitingOnUserName } : null,
    waitingOnExternalName: task.waitingOnExternalName,
    waitingDetails: task.waitingDetails,
    approverUser: task.approverName ? { name: task.approverName } : null,
    approvalRequestedAt: task.approvalRequestedAt ? new Date(task.approvalRequestedAt) : null,
    nextAction: task.nextAction,
  };
  const waitingBadge =
    task.operationalLabels.some((label) => WAITING_LABELS.includes(label)) ||
    hasWaitingOperationalData({
      status: task.status,
      operationalLabels: task.operationalLabels,
      waitingStartedAt: task.waitingStartedAt,
      waitingOnUserIds: task.waitingOnUserIds,
      waitingOnExternalName: task.waitingOnExternalName,
      waitingDetails: task.waitingDetails,
      approverId: task.approverId,
      approvalRequestedAt: task.approvalRequestedAt,
      approvalCompletedAt: task.approvalCompletedAt,
      nextAction: task.nextAction,
      isProjectBottleneck: task.isProjectBottleneck,
    });
  const approvalBadge =
    task.operationalLabels.some((label) => PENDING_APPROVAL_LABELS.includes(label) || APPROVAL_OUTCOME_LABELS.includes(label)) ||
    hasApprovalOperationalData({
      approverId: task.approverId,
      approvalRequestedAt: task.approvalRequestedAt,
      approvalCompletedAt: task.approvalCompletedAt,
    });
  const riskBadge = isBlockedNode(node) || isAtRiskNode(node) || isOverdueNode(node) || task.operationalLabels.some((label) => EXECUTION_RISK_LABELS.includes(label));

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <Badge tone={statusTone(task.status)}>{task.status.replaceAll("_", " ")}</Badge>
      {waitingBadge ? <Badge tone="warn">{copy.summaryWaiting}</Badge> : null}
      {approvalBadge ? <Badge tone="info">{copy.summaryApproval}</Badge> : null}
      {riskBadge ? <Badge tone={isBlockedNode(node) ? "bad" : "warn"}>{copy.summaryRisk}</Badge> : null}
      {task.isProjectBottleneck ? <Badge tone="bad">{copy.summaryBottleneck}</Badge> : null}
    </div>
  );
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
  waitingOnUserIds: string[];
  waitingOnExternalName: string | null;
  waitingDetails: string | null;
  approverId: string | null;
  approvalRequestedAt: string | null;
  approvalCompletedAt: string | null;
  nextAction: string | null;
  isProjectBottleneck: boolean;
};

type TaskLabelCategory = "waiting" | "approval" | "risk";

function getDefaultLabelCategory(node: TaskOperationalFormState): TaskLabelCategory {
  if (node.operationalLabels.some((label) => WAITING_LABELS.includes(label)) || hasWaitingOperationalData(node)) {
    return "waiting";
  }
  if (
    node.operationalLabels.some((label) => PENDING_APPROVAL_LABELS.includes(label) || APPROVAL_OUTCOME_LABELS.includes(label)) ||
    hasApprovalOperationalData(node)
  ) {
    return "approval";
  }
  return "risk";
}

function LabelCheckboxGroup({
  options,
  selectedLabels,
  onToggle,
}: {
  options: ProjectTasksCopy["labelOptions"];
  selectedLabels: WorkflowNodeLabel[];
  onToggle: (label: WorkflowNodeLabel, checked: boolean) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {options.map((option) => (
        <label key={option.value} className="flex items-start gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm">
          <input
            type="checkbox"
            name="operationalLabels"
            value={option.value}
            checked={selectedLabels.includes(option.value)}
            onChange={(event) => onToggle(option.value, event.currentTarget.checked)}
            className="mt-0.5"
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

function MultiPersonPicker({
  name,
  options,
  selectedIds,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyLabel,
}: {
  name: string;
  options: { id: string; name: string }[];
  selectedIds: string[];
  onChange: (nextIds: string[]) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedPeople = options.filter((option) => selectedIds.includes(option.id));
  const filteredOptions = options.filter((option) => option.name.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={rootRef} className="space-y-2">
      {selectedIds.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-left outline-none ring-[hsl(var(--accent))] transition focus:ring-2"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {selectedPeople.length ? (
            selectedPeople.map((person) => (
              <span
                key={person.id}
                className="inline-flex max-w-full items-center rounded-full bg-[hsl(var(--accent))]/12 px-2 py-1 text-xs font-medium text-[hsl(var(--foreground))]"
              >
                @{person.name}
              </span>
            ))
          ) : (
            <span className="text-sm text-[hsl(var(--muted))]">{placeholder}</span>
          )}
        </span>
        <ChevronDown className={`shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="space-y-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
            placeholder={searchPlaceholder}
            className="text-sm"
          />
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {filteredOptions.length ? (
              filteredOptions.map((option) => {
                const checked = selectedIds.includes(option.id);
                return (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        if (event.currentTarget.checked) {
                          onChange([...selectedIds, option.id]);
                          return;
                        }
                        onChange(selectedIds.filter((id) => id !== option.id));
                      }}
                    />
                    <span>{option.name}</span>
                  </label>
                );
              })
            ) : (
              <p className="px-2 py-3 text-sm text-[hsl(var(--muted))]">{emptyLabel}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NodeDetailsDialog({
  dialogId,
  projectId,
  node,
  memberOptions,
  copy,
}: {
  dialogId: string;
  projectId: string;
  node: { id: string; description: string | null; dueAt: string | null; assigneeId: string | null; status: WorkflowNodeStatus };
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
            void updateWorkflowNodeDetailsAction(fd).finally(() => {
              (document.getElementById(dialogId) as HTMLDialogElement | null)?.close();
              router.refresh();
            });
          });
        }}
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="nodeId" value={node.id} />
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

function NodeLabelsDialog({
  dialogId,
  projectId,
  node,
  memberOptions,
  copy,
}: {
  dialogId: string;
  projectId: string;
  node: { id: string } & TaskOperationalFormState;
  memberOptions: { id: string; name: string }[];
  copy: ProjectTasksCopy;
}) {
  const waitingLabelOptions = copy.labelOptions.filter((option) => WAITING_LABELS.includes(option.value));
  const approvalLabelOptions = copy.labelOptions.filter(
    (option) => PENDING_APPROVAL_LABELS.includes(option.value) || APPROVAL_OUTCOME_LABELS.includes(option.value),
  );
  const riskLabelOptions = copy.labelOptions.filter((option) => EXECUTION_RISK_LABELS.includes(option.value));
  const router = useRouter();
  const [, startLabelsTransition] = useTransition();
  const [selectedLabels, setSelectedLabels] = useState<WorkflowNodeLabel[]>(node.operationalLabels);
  const [selectedWaitingUserIds, setSelectedWaitingUserIds] = useState<string[]>(node.waitingOnUserIds);
  const [activeCategory, setActiveCategory] = useState<TaskLabelCategory>(() => getDefaultLabelCategory(node));
  const syncKey = [
    node.id,
    node.operationalLabels.join(","),
    node.waitingStartedAt ?? "",
    node.waitingOnUserIds.join(","),
    node.waitingOnExternalName ?? "",
    node.waitingDetails ?? "",
    node.approverId ?? "",
    node.approvalRequestedAt ?? "",
    node.approvalCompletedAt ?? "",
    node.nextAction ?? "",
    node.isProjectBottleneck ? "1" : "0",
  ].join("|");

  useEffect(() => {
    setSelectedLabels(node.operationalLabels);
    setSelectedWaitingUserIds(node.waitingOnUserIds);
    setActiveCategory(getDefaultLabelCategory(node));
  }, [syncKey]);

  function handleLabelToggle(label: WorkflowNodeLabel, checked: boolean) {
    setSelectedLabels((current) => {
      if (checked) return [...current, label];
      return current.filter((value) => value !== label);
    });
  }

  const waitingDetailsVisible =
    activeCategory === "waiting" || selectedLabels.some((label) => WAITING_LABELS.includes(label)) || selectedWaitingUserIds.length > 0 || hasWaitingOperationalData(node);
  const approvalDetailsVisible =
    activeCategory === "approval" ||
    selectedLabels.some((label) => PENDING_APPROVAL_LABELS.includes(label) || APPROVAL_OUTCOME_LABELS.includes(label)) ||
    hasApprovalOperationalData(node);
  const riskDetailsVisible = selectedLabels.some((label) => EXECUTION_RISK_LABELS.includes(label)) || hasRiskOperationalData(node);
  const categories: { key: TaskLabelCategory; label: string }[] = [
    { key: "waiting", label: copy.labelGroupWaiting },
    { key: "approval", label: copy.labelGroupApproval },
    { key: "risk", label: copy.labelGroupRisk },
  ];

  return (
    <dialog
      id={dialogId}
      className="app-modal-dialog z-50 max-h-[min(90vh,720px)] w-[min(100vw-2rem,720px)] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0 shadow-2xl backdrop:bg-black/40"
    >
      <div className="flex items-start justify-between gap-2 border-b border-[hsl(var(--border))] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">{copy.labelsTitle}</h3>
          <p className="text-xs text-[hsl(var(--muted))]">{copy.labelsLead}</p>
        </div>
        <CloseDialogButton
          dialogId={dialogId}
          className="rounded-lg px-2 py-1 text-xs text-[hsl(var(--muted))] hover:bg-black/5 dark:hover:bg-white/10"
          label={copy.dialogClose}
        />
      </div>
      <form
        className="max-h-[calc(90vh-100px)] space-y-4 overflow-y-auto p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startLabelsTransition(() => {
            void updateWorkflowNodeOperationalAction(fd).finally(() => {
              (document.getElementById(dialogId) as HTMLDialogElement | null)?.close();
              router.refresh();
            });
          });
        }}
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="nodeId" value={node.id} />
        <div className="space-y-1">
          <label className="text-xs font-medium text-[hsl(var(--muted))]">{copy.categoryLabel}</label>
          <div className="grid gap-2 sm:grid-cols-3">
            {categories.map((category) => {
              const active = activeCategory === category.key;
              return (
                <button
                  key={category.key}
                  type="button"
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                    active
                      ? "border-[hsl(var(--foreground))] bg-[hsl(var(--foreground))] text-[hsl(var(--card))]"
                      : "border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-black/5 dark:hover:bg-white/10"
                  }`}
                  onClick={() => setActiveCategory(category.key)}
                >
                  {category.label}
                </button>
              );
            })}
          </div>
        </div>
        <section className={activeCategory === "waiting" ? "space-y-3" : "hidden"}>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[hsl(var(--muted))]">{copy.labelsLabel}</label>
            <LabelCheckboxGroup options={waitingLabelOptions} selectedLabels={selectedLabels} onToggle={handleLabelToggle} />
          </div>
          <div className={waitingDetailsVisible ? "grid gap-3 md:grid-cols-2" : "hidden"}>
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
              <MultiPersonPicker
                name="waitingOnUserIds"
                options={memberOptions}
                selectedIds={selectedWaitingUserIds}
                onChange={setSelectedWaitingUserIds}
                placeholder={copy.peoplePickerPlaceholder}
                searchPlaceholder={copy.peoplePickerSearchPlaceholder}
                emptyLabel={copy.peoplePickerEmpty}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium text-[hsl(var(--muted))]">{copy.waitingOnExternalLabel}</label>
              <Input
                name="waitingOnExternalName"
                defaultValue={node.waitingOnExternalName ?? ""}
                placeholder={copy.externalPlaceholder}
                className="text-sm"
              />
            </div>
          </div>
          <div className={waitingDetailsVisible ? "space-y-1" : "hidden"}>
            <label className="text-xs font-medium text-[hsl(var(--muted))]">{copy.waitingDetailsLabel}</label>
            <textarea
              name="waitingDetails"
              rows={3}
              defaultValue={node.waitingDetails ?? ""}
              placeholder={copy.waitingDetailsPlaceholder}
              className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[hsl(var(--accent))] focus:ring-2"
            />
          </div>
        </section>

        <section className={activeCategory === "approval" ? "space-y-3" : "hidden"}>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[hsl(var(--muted))]">{copy.labelsLabel}</label>
            <LabelCheckboxGroup options={approvalLabelOptions} selectedLabels={selectedLabels} onToggle={handleLabelToggle} />
          </div>
          <div className={approvalDetailsVisible ? "grid gap-3 md:grid-cols-2" : "hidden"}>
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
        </section>

        <section className={activeCategory === "risk" ? "space-y-3" : "hidden"}>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[hsl(var(--muted))]">{copy.labelsLabel}</label>
            <LabelCheckboxGroup options={riskLabelOptions} selectedLabels={selectedLabels} onToggle={handleLabelToggle} />
          </div>
          <div className={riskDetailsVisible || activeCategory === "risk" ? "space-y-3" : "hidden"}>
            <label className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
              <input type="checkbox" name="isProjectBottleneck" defaultChecked={node.isProjectBottleneck} />
              {copy.bottleneckLabel}
            </label>
          </div>
        </section>

        <div className={activeCategory === "waiting" ? "hidden" : "space-y-1"}>
          <label className="text-xs font-medium text-[hsl(var(--muted))]">{copy.nextActionLabel}</label>
          <textarea
            name="nextAction"
            rows={3}
            defaultValue={node.nextAction ?? ""}
            placeholder={copy.nextActionPlaceholder}
            className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[hsl(var(--accent))] focus:ring-2"
          />
        </div>

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
  const [, startRefreshTransition] = useTransition();
  const [, startToggleTransition] = useTransition();
  const [optimisticTasks, runOptimistic] = useOptimistic(tasks, applyTasksOptimistic);
  const [submittingKeys, setSubmittingKeys] = useState<Record<string, boolean>>({});
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newSubtaskTitles, setNewSubtaskTitles] = useState<Record<string, string>>({});
  const isBusy = isOtherPending || Object.values(submittingKeys).some(Boolean);

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

  useEffect(() => {
    setOpen((current) => {
      const next = { ...current };
      for (const task of tasks) {
        if (task.children.length && next[task.id] === undefined) next[task.id] = true;
      }
      return next;
    });
  }, [tasks]);

  const setSubmitting = useCallback((key: string, pending: boolean) => {
    setSubmittingKeys((current) => {
      if (pending) return { ...current, [key]: true };
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const refreshRoute = useCallback(() => {
    startRefreshTransition(() => {
      router.refresh();
    });
  }, [router, startRefreshTransition]);

  const runTrackedMutation = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setSubmitting(key, true);
      try {
        await action();
      } finally {
        setSubmitting(key, false);
        refreshRoute();
      }
    },
    [refreshRoute, setSubmitting],
  );

  const isSubmitting = useCallback((key: string) => !!submittingKeys[key], [submittingKeys]);

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
                  void runTrackedMutation("undo", () => undoLastProjectTaskDeletionAction(fd));
                });
              }}
              title={undoAvailable ? copy.undoHint : copy.undoDisabledHint}
            >
              <input type="hidden" name="projectId" value={projectId} />
              <FormSubmitButton
                type="submit"
                variant="secondary"
                className="h-8 gap-2 px-2.5"
                disabled={!undoAvailable || isSubmitting("undo")}
              >
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
                  void runTrackedMutation("clear-all", () => deleteAllProjectTasksAction(fd));
                });
              }}
            >
              <input type="hidden" name="projectId" value={projectId} />
              <FormSubmitButton
                type="submit"
                variant="secondary"
                className="h-8 gap-2 text-rose-600 dark:text-rose-400"
                disabled={isSubmitting("clear-all")}
              >
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
                const mutationKey = "add-root";
                const assigneeId = String(fd.get("assigneeId") ?? "").trim();
                const assigneeName = assigneeId ? (memberOptions.find((m) => m.id === assigneeId)?.name ?? null) : null;
                const dueRaw = String(fd.get("dueAt") ?? "").trim();
                const dueAt = dueRaw ? new Date(dueRaw).toISOString() : null;
                const status = (String(fd.get("status") ?? "").trim() || "NOT_STARTED") as WorkflowNodeStatus;
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
                      operationalLabels: [],
                      waitingStartedAt: null,
                      waitingOnUserIds: [],
                      waitingOnUserNames: [],
                      waitingOnUserId: null,
                      waitingOnUserName: null,
                      waitingOnExternalName: null,
                      waitingDetails: null,
                      approverId: null,
                      approverName: null,
                      approvalRequestedAt: null,
                      approvalCompletedAt: null,
                      nextAction: null,
                      isProjectBottleneck: false,
                      children: [],
                    },
                  });
                  void runTrackedMutation(mutationKey, () => addProjectTaskAction(fd));
                });
                form.reset();
                setNewTaskTitle("");
              }}
              className="space-y-2"
            >
              <input type="hidden" name="projectId" value={projectId} />
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  name="title"
                  required
                  placeholder={copy.newTaskPh}
                  className="h-8 w-40 text-sm md:w-52"
                  value={newTaskTitle}
                  onChange={(event) => setNewTaskTitle(event.currentTarget.value)}
                />
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
                <FormSubmitButton
                  type="submit"
                  variant="secondary"
                  className="h-8 gap-1.5 px-3"
                  disabled={!newTaskTitle.trim() || isSubmitting("add-root")}
                >
                  <IconPlus />
                  {copy.addTask}
                </FormSubmitButton>
              </div>
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
            const taskDetailsDialogId = `task-details-${task.id}`;
            const taskLabelsDialogId = `task-labels-${task.id}`;
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
                          void runTrackedMutation(`toggle:${task.id}`, () => toggleProjectTaskLeafAction(fd));
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
                    <TaskOperationalSummary task={task} copy={copy} />
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular-nums text-[hsl(var(--foreground))]">{task.progressPercent}%</span>
                    <ProgressTrack pct={task.progressPercent} thick />
                  </div>
                  {canEdit ? (
                    <DropdownMenu buttonContent={<IconMore />}>
                      <OpenDialogButton
                        dialogId={taskDetailsDialogId}
                        className="flex h-8 w-full items-center rounded-md px-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        {copy.editDetails}
                      </OpenDialogButton>
                      <OpenDialogButton
                        dialogId={taskLabelsDialogId}
                        className="flex h-8 w-full items-center rounded-md px-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        {copy.editLabels}
                      </OpenDialogButton>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const fd = new FormData(e.currentTarget);
                          startToggleTransition(() => {
                            runOptimistic({ type: "delete", nodeId: task.id });
                            void runTrackedMutation(`delete:${task.id}`, () => deleteProjectTaskAction(fd));
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
                  <>
                    <NodeDetailsDialog
                      dialogId={taskDetailsDialogId}
                      projectId={projectId}
                      node={{
                        id: task.id,
                        description: task.description,
                        dueAt: task.dueAt,
                        assigneeId: task.assigneeId,
                        status: task.status,
                      }}
                      memberOptions={memberOptions}
                      copy={copy}
                    />
                    <NodeLabelsDialog
                      dialogId={taskLabelsDialogId}
                      projectId={projectId}
                      node={{
                        id: task.id,
                        status: task.status,
                        operationalLabels: task.operationalLabels,
                        waitingStartedAt: task.waitingStartedAt,
                        waitingOnUserIds: task.waitingOnUserIds,
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
                  </>
                ) : null}

                {expanded ? (
                  <div className="space-y-2 border-t border-[hsl(var(--border))] px-3 pb-3 pt-2">
                    {hasKids ? null : <p className="text-xs text-[hsl(var(--muted))]">{copy.noSubtasksHint}</p>}
                    {task.children.map((sub) => {
                      const done = isComplete(sub.status);
                      const subDetailsDialogId = `task-details-${sub.id}`;
                      const subLabelsDialogId = `task-labels-${sub.id}`;
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
                                    void runTrackedMutation(`toggle:${sub.id}`, () => toggleProjectTaskLeafAction(fd));
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
                              <TaskOperationalSummary task={sub} copy={copy} />
                            </div>
                            <span className="shrink-0 text-sm font-semibold tabular-nums">{sub.progressPercent}%</span>
                            <div className="w-24 shrink-0">
                              <ProgressTrack pct={sub.progressPercent} />
                            </div>
                            {canEdit ? (
                              <DropdownMenu buttonContent={<IconMore />}>
                                <OpenDialogButton
                                  dialogId={subDetailsDialogId}
                                  className="flex h-8 w-full items-center rounded-md px-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
                                >
                                  {copy.editDetails}
                                </OpenDialogButton>
                                <OpenDialogButton
                                  dialogId={subLabelsDialogId}
                                  className="flex h-8 w-full items-center rounded-md px-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
                                >
                                  {copy.editLabels}
                                </OpenDialogButton>
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    const fd = new FormData(e.currentTarget);
                                    startToggleTransition(() => {
                                      runOptimistic({ type: "delete", nodeId: sub.id });
                                      void runTrackedMutation(`delete:${sub.id}`, () => deleteProjectTaskAction(fd));
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
                            <>
                              <NodeDetailsDialog
                                dialogId={subDetailsDialogId}
                                projectId={projectId}
                                node={{
                                  id: sub.id,
                                  description: sub.description,
                                  dueAt: sub.dueAt,
                                  assigneeId: sub.assigneeId,
                                  status: sub.status,
                                }}
                                memberOptions={memberOptions}
                                copy={copy}
                              />
                              <NodeLabelsDialog
                                dialogId={subLabelsDialogId}
                                projectId={projectId}
                                node={{
                                  id: sub.id,
                                  status: sub.status,
                                  operationalLabels: sub.operationalLabels,
                                  waitingStartedAt: sub.waitingStartedAt,
                                  waitingOnUserIds: sub.waitingOnUserIds,
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
                            </>
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
                          const mutationKey = `add-sub:${task.id}`;
                          const assigneeId = String(fd.get("assigneeId") ?? "").trim();
                          const assigneeName = assigneeId ? (memberOptions.find((m) => m.id === assigneeId)?.name ?? null) : null;
                          const dueRaw = String(fd.get("dueAt") ?? "").trim();
                          const dueAt = dueRaw ? new Date(dueRaw).toISOString() : null;
                          const status = (String(fd.get("status") ?? "").trim() || "NOT_STARTED") as WorkflowNodeStatus;
                          startOtherTransition(() => {
                            setOpen((current) => ({ ...current, [task.id]: true }));
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
                                operationalLabels: [],
                                waitingStartedAt: null,
                                waitingOnUserIds: [],
                                waitingOnUserNames: [],
                                waitingOnUserId: null,
                                waitingOnUserName: null,
                                waitingOnExternalName: null,
                                waitingDetails: null,
                                approverId: null,
                                approverName: null,
                                approvalRequestedAt: null,
                                approvalCompletedAt: null,
                                nextAction: null,
                                isProjectBottleneck: false,
                                children: [],
                              },
                            });
                            void runTrackedMutation(mutationKey, () => addProjectSubtaskAction(fd));
                          });
                          form.reset();
                          setNewSubtaskTitles((current) => ({ ...current, [task.id]: "" }));
                        }}
                        className="space-y-2 pt-1 sm:ml-16 lg:ml-24"
                      >
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="parentNodeId" value={task.id} />
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            name="title"
                            required
                            placeholder={copy.newSubPh}
                            className="h-8 max-w-[200px] flex-1 text-sm"
                            value={newSubtaskTitles[task.id] ?? ""}
                            onChange={(event) =>
                              setNewSubtaskTitles((current) => ({
                                ...current,
                                [task.id]: event.currentTarget.value,
                              }))
                            }
                          />
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
                          <FormSubmitButton
                            type="submit"
                            variant="secondary"
                            className="h-8"
                            disabled={!((newSubtaskTitles[task.id] ?? "").trim()) || isSubmitting(`add-sub:${task.id}`)}
                          >
                            {copy.addSubtask}
                          </FormSubmitButton>
                        </div>
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
