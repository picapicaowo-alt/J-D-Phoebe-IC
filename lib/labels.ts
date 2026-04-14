import type {
  CompanyStatus,
  CompanionSpecies,
  Priority,
  ProjectStatus,
  RecognitionMode,
  RecognitionTagCategory,
  WorkflowNodeStatus,
  WorkflowNodeType,
} from "@prisma/client";

export function labelCompanyStatus(s: CompanyStatus) {
  const m: Record<CompanyStatus, string> = {
    ACTIVE: "Active",
    ARCHIVED: "Archived",
    SUSPENDED: "Suspended",
  };
  return m[s];
}

export function labelProjectStatus(s: ProjectStatus) {
  const m: Record<ProjectStatus, string> = {
    PLANNING: "Planning",
    ACTIVE: "Active",
    AT_RISK: "At risk",
    ON_HOLD: "On hold",
    COMPLETED: "Completed",
    ARCHIVED: "Archived",
    CANCELLED: "Cancelled",
  };
  return m[s];
}

export function labelNodeStatus(s: WorkflowNodeStatus) {
  const m: Record<WorkflowNodeStatus, string> = {
    NOT_STARTED: "Not started",
    IN_PROGRESS: "In progress",
    WAITING: "Waiting",
    BLOCKED: "Blocked",
    APPROVED: "Approved",
    DONE: "Done",
    SKIPPED: "Skipped",
  };
  return m[s];
}

export function labelNodeType(t: WorkflowNodeType) {
  const m: Record<WorkflowNodeType, string> = {
    MILESTONE: "Milestone",
    TASK: "Task",
    APPROVAL: "Approval",
    WAITING: "Waiting / blocked",
    COMPLETED: "Completed",
  };
  return m[t];
}

export function labelPriority(p: Priority) {
  const m: Record<Priority, string> = {
    LOW: "Low",
    MEDIUM: "Medium",
    HIGH: "High",
    URGENT: "Urgent",
  };
  return m[p];
}

export function labelRecognitionMode(mode: RecognitionMode) {
  const m: Record<RecognitionMode, string> = {
    PUBLIC: "Public",
    SEMI_ANONYMOUS: "Semi-anonymous",
    ANONYMOUS: "Anonymous",
  };
  return m[mode];
}

export function labelRecognitionCategory(category: RecognitionTagCategory) {
  const m: Record<RecognitionTagCategory, string> = {
    RESULT: "Result",
    COLLABORATION: "Collaboration",
    THINKING: "Thinking",
    CREATIVITY: "Creativity",
    CULTURE: "Culture",
    STABILITY: "Stability",
    LEADERSHIP: "Leadership",
  };
  return m[category];
}

export function labelCompanionSpecies(species: CompanionSpecies) {
  const m: Record<CompanionSpecies, string> = {
    RABBIT: "Rabbit",
    HAMSTER: "Hamster",
    CAT: "Cat",
    DOG: "Dog",
    BIRD: "Bird",
    PENGUIN: "Penguin",
    BEAR: "Bear",
    OTTER: "Otter",
  };
  return m[species];
}
