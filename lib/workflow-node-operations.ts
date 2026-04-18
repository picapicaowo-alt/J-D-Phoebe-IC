import type { Prisma, WorkflowNodeLabel, WorkflowNodeStatus, WorkflowNodeType } from "@prisma/client";

export const WORKFLOW_NODE_LABELS: WorkflowNodeLabel[] = [
  "WAITING_ON_RESPONSE",
  "WAITING_ON_INTERNAL_TEAM_MEMBER",
  "WAITING_ON_EXTERNAL_PARTY",
  "WAITING_ON_CLIENT",
  "WAITING_ON_VENDOR_PARTNER",
  "WAITING_ON_DOCUMENT_MATERIAL",
  "PENDING_APPROVAL",
  "UNDER_REVIEW",
  "APPROVED",
  "NEEDS_REVISION",
  "REJECTED",
  "AT_RISK",
  "BLOCKED",
  "OVERDUE",
  "PAUSED",
];

export const WAITING_LABELS: WorkflowNodeLabel[] = [
  "WAITING_ON_RESPONSE",
  "WAITING_ON_INTERNAL_TEAM_MEMBER",
  "WAITING_ON_EXTERNAL_PARTY",
  "WAITING_ON_CLIENT",
  "WAITING_ON_VENDOR_PARTNER",
  "WAITING_ON_DOCUMENT_MATERIAL",
];

export const INTERNAL_WAITING_LABELS: WorkflowNodeLabel[] = ["WAITING_ON_INTERNAL_TEAM_MEMBER"];
export const EXTERNAL_WAITING_LABELS: WorkflowNodeLabel[] = [
  "WAITING_ON_RESPONSE",
  "WAITING_ON_EXTERNAL_PARTY",
  "WAITING_ON_CLIENT",
  "WAITING_ON_VENDOR_PARTNER",
  "WAITING_ON_DOCUMENT_MATERIAL",
];
export const PENDING_APPROVAL_LABELS: WorkflowNodeLabel[] = ["PENDING_APPROVAL", "UNDER_REVIEW"];
export const APPROVAL_OUTCOME_LABELS: WorkflowNodeLabel[] = ["APPROVED", "NEEDS_REVISION", "REJECTED"];
export const EXECUTION_RISK_LABELS: WorkflowNodeLabel[] = ["AT_RISK", "BLOCKED", "OVERDUE", "PAUSED"];
const BLOCKED_LABELS: WorkflowNodeLabel[] = ["BLOCKED"];
const AT_RISK_LABELS: WorkflowNodeLabel[] = ["AT_RISK"];
const OVERDUE_LABELS: WorkflowNodeLabel[] = ["OVERDUE"];

export const WAIT_WARNING_DAYS = 4;
export const WAIT_BLOCKED_DAYS = 8;

export type WorkflowNodeOperationalShape = {
  status: WorkflowNodeStatus;
  nodeType?: WorkflowNodeType | null;
  dueAt?: Date | null;
  operationalLabels: WorkflowNodeLabel[];
  waitingStartedAt?: Date | null;
  waitingOnUser?: { name: string | null } | null;
  waitingOnUsers?: { name: string | null }[] | null;
  waitingOnExternalName?: string | null;
  waitingDetails?: string | null;
  approverUser?: { name: string | null } | null;
  approvalRequestedAt?: Date | null;
  nextAction?: string | null;
};

export function isWorkflowNodeComplete(status: WorkflowNodeStatus) {
  return status === "DONE" || status === "SKIPPED";
}

export function hasAnyOperationalLabel(labels: WorkflowNodeLabel[] | undefined | null, candidates: WorkflowNodeLabel[]) {
  if (!labels?.length) return false;
  return labels.some((label) => candidates.includes(label));
}

export function normalizeOperationalLabels(rawLabels: string[]): WorkflowNodeLabel[] {
  const unique = new Set<WorkflowNodeLabel>();
  for (const raw of rawLabels) {
    if ((WORKFLOW_NODE_LABELS as string[]).includes(raw)) {
      unique.add(raw as WorkflowNodeLabel);
    }
  }
  return WORKFLOW_NODE_LABELS.filter((label) => unique.has(label));
}

/**
 * MySQL 1:1 migration: `WorkflowNode.operationalLabels` is stored as `Json` (was PG `enum[]`).
 * Coerce Prisma's `JsonValue` reads back into a typed `WorkflowNodeLabel[]`.
 */
export function decodeOperationalLabels(value: Prisma.JsonValue | null | undefined): WorkflowNodeLabel[] {
  if (!Array.isArray(value)) return [];
  const known = new Set<string>(WORKFLOW_NODE_LABELS as string[]);
  const out: WorkflowNodeLabel[] = [];
  for (const item of value) {
    if (typeof item === "string" && known.has(item)) {
      out.push(item as WorkflowNodeLabel);
    }
  }
  return out;
}

/** Convenience: copy a Prisma row replacing the `JsonValue` operationalLabels with the decoded array. */
export function withDecodedOperationalLabels<T extends { operationalLabels: Prisma.JsonValue }>(
  row: T,
): Omit<T, "operationalLabels"> & { operationalLabels: WorkflowNodeLabel[] } {
  return { ...row, operationalLabels: decodeOperationalLabels(row.operationalLabels) };
}

export function isWaitingNode(node: WorkflowNodeOperationalShape) {
  return node.status === "WAITING" || hasAnyOperationalLabel(node.operationalLabels, WAITING_LABELS);
}

export function isInternalWaitingNode(node: WorkflowNodeOperationalShape) {
  return isWaitingNode(node) && (!!node.waitingOnUser || !!node.waitingOnUsers?.length || hasAnyOperationalLabel(node.operationalLabels, INTERNAL_WAITING_LABELS));
}

export function isExternalWaitingNode(node: WorkflowNodeOperationalShape) {
  return (
    isWaitingNode(node) &&
    !isInternalWaitingNode(node) &&
    (!!node.waitingOnExternalName || !!node.waitingDetails || hasAnyOperationalLabel(node.operationalLabels, EXTERNAL_WAITING_LABELS))
  );
}

export function isPendingApprovalNode(node: WorkflowNodeOperationalShape) {
  return (
    hasAnyOperationalLabel(node.operationalLabels, PENDING_APPROVAL_LABELS) ||
    (!!node.nodeType && node.nodeType === "APPROVAL" && !isWorkflowNodeComplete(node.status) && node.status !== "APPROVED")
  );
}

export function waitAgeInDays(startedAt: Date | null | undefined, now = new Date()) {
  if (!startedAt) return null;
  const start = new Date(startedAt.getFullYear(), startedAt.getMonth(), startedAt.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86400000));
}

export function getWaitingEscalation(node: WorkflowNodeOperationalShape, now = new Date()) {
  if (!isWaitingNode(node) || !node.waitingStartedAt) return null;
  const days = waitAgeInDays(node.waitingStartedAt, now);
  if (days === null) return null;
  if (days >= WAIT_BLOCKED_DAYS) return { days, level: "blocked" as const };
  if (days >= WAIT_WARNING_DAYS) return { days, level: "warning" as const };
  return { days, level: "normal" as const };
}

export function isBlockedNode(node: WorkflowNodeOperationalShape, now = new Date()) {
  return node.status === "BLOCKED" || hasAnyOperationalLabel(node.operationalLabels, BLOCKED_LABELS) || getWaitingEscalation(node, now)?.level === "blocked";
}

export function isAtRiskNode(node: WorkflowNodeOperationalShape, now = new Date()) {
  return hasAnyOperationalLabel(node.operationalLabels, AT_RISK_LABELS) || getWaitingEscalation(node, now)?.level === "warning";
}

export function isOverdueNode(node: WorkflowNodeOperationalShape, now = new Date()) {
  if (hasAnyOperationalLabel(node.operationalLabels, OVERDUE_LABELS)) return true;
  if (!node.dueAt || isWorkflowNodeComplete(node.status)) return false;
  const due = new Date(node.dueAt.getFullYear(), node.dueAt.getMonth(), node.dueAt.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return due.getTime() < today.getTime();
}

export function getWaitingOnDisplay(node: WorkflowNodeOperationalShape) {
  const internalNames = [
    ...(node.waitingOnUsers ?? []).map((person) => person.name?.trim() || "").filter(Boolean),
    node.waitingOnUser?.name?.trim() || "",
  ].filter(Boolean);
  const uniqueInternalNames = [...new Set(internalNames)];
  const actor = uniqueInternalNames.length
    ? uniqueInternalNames.map((name) => `@${name}`).join(", ")
    : node.waitingOnExternalName
      ? node.waitingOnExternalName
      : null;
  const detail = node.waitingDetails?.trim() || null;

  if (actor && detail) return `${actor} — ${detail}`;
  if (actor) return actor;
  if (detail) return detail;
  return null;
}

export function getApprovalOwnerDisplay(node: WorkflowNodeOperationalShape) {
  return node.approverUser?.name ?? null;
}

export function getOperationalNextAction(node: WorkflowNodeOperationalShape) {
  if (node.nextAction?.trim()) return node.nextAction.trim();
  if (isBlockedNode(node)) return "Escalate the blocker and confirm the unblock owner.";
  if (isPendingApprovalNode(node)) return "Follow up with the approver and move the review to a decision.";
  if (isInternalWaitingNode(node)) return "Ping the assigned teammate and confirm a response date.";
  if (isExternalWaitingNode(node)) return "Follow up with the external party and capture the expected response date.";
  if (isOverdueNode(node)) return "Re-plan the work or close the overdue item.";
  if (isAtRiskNode(node)) return "Review the delay risk and agree on a recovery step.";
  return "Review the task and confirm the next operational step.";
}

export function formatWorkflowNodeLabel(label: WorkflowNodeLabel) {
  switch (label) {
    case "WAITING_ON_RESPONSE":
      return "Waiting on Response";
    case "WAITING_ON_INTERNAL_TEAM_MEMBER":
      return "Waiting on Internal Team Member";
    case "WAITING_ON_EXTERNAL_PARTY":
      return "Waiting on External Party";
    case "WAITING_ON_CLIENT":
      return "Waiting on Client";
    case "WAITING_ON_VENDOR_PARTNER":
      return "Waiting on Vendor / Partner";
    case "WAITING_ON_DOCUMENT_MATERIAL":
      return "Waiting on Document / Material";
    case "PENDING_APPROVAL":
      return "Pending Approval";
    case "UNDER_REVIEW":
      return "Under Review";
    case "APPROVED":
      return "Approved";
    case "NEEDS_REVISION":
      return "Needs Revision";
    case "REJECTED":
      return "Rejected";
    case "AT_RISK":
      return "At Risk";
    case "BLOCKED":
      return "Blocked";
    case "OVERDUE":
      return "Overdue";
    case "PAUSED":
      return "Paused";
    default:
      return label;
  }
}
