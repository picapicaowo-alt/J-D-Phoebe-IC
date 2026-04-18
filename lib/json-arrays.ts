import type { Prisma } from "@prisma/client";

/**
 * MySQL has no native arrays, so two columns that were PG arrays in the original schema are
 * stored as `Json` here:
 *   - `WorkflowNode.operationalLabels` (was `WorkflowNodeLabel[]`)
 *   - `CalendarEvent.externalAttendeeEmails` (was `String[]`)
 *
 * `decodeOperationalLabels` lives in `lib/workflow-node-operations.ts`. This file holds the
 * generic string array decoder used for `externalAttendeeEmails`.
 */

export function decodeStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
