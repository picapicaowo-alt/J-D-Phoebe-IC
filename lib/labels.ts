import type {
  CompanyStatus,
  CompanionSpecies,
  FeedbackCategory,
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
    GUIDANCE: "Guidance",
  };
  return m[category];
}

export function labelFeedbackCategory(category: FeedbackCategory) {
  const m: Record<FeedbackCategory, string> = {
    COMMUNICATION: "Communication",
    DELIVERY_QUALITY: "Delivery quality",
    FOLLOW_THROUGH: "Follow-through",
    DOCUMENTATION: "Documentation",
    COLLABORATION_RESPONSIVENESS: "Collaboration responsiveness",
  };
  return m[category];
}

export function labelCompanionSpecies(species: CompanionSpecies) {
  const m: Record<CompanionSpecies, string> = {
    BIRD: "Bird",
    BEAR: "Bear",
    PENGUIN: "Penguin",
    DOG: "Dog",
    CAT: "Cat",
    BEAVER: "Beaver",
    BUNNY: "Bunny",
    HAMSTER: "Hamster",
  };
  return m[species];
}
