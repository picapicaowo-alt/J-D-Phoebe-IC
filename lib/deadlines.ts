import { getZonedDaySerial, toDatetimeLocalValueInTimeZone } from "@/lib/timezone";

export function countdownPhrase(deadline: Date | null | undefined, now = new Date(), timeZone = "UTC") {
  if (!deadline) return "No deadline";

  const todaySerial = getZonedDaySerial(now, timeZone);
  const dueSerial = getZonedDaySerial(deadline, timeZone);
  if (todaySerial == null || dueSerial == null) return "No deadline";
  const diffDays = dueSerial - todaySerial;

  if (diffDays > 1) return `${diffDays} days left`;
  if (diffDays === 1) return "1 day left";
  if (diffDays === 0) return "Due today";
  if (diffDays === -1) return "Overdue by 1 day";
  return `Overdue by ${Math.abs(diffDays)} days`;
}

export function isOverdue(deadline: Date | null | undefined, now = new Date(), timeZone = "UTC") {
  if (!deadline) return false;
  const todaySerial = getZonedDaySerial(now, timeZone);
  const dueSerial = getZonedDaySerial(deadline, timeZone);
  if (todaySerial == null || dueSerial == null) return false;
  return dueSerial < todaySerial;
}

/** Value for `<input type="datetime-local" />` in the selected timezone. */
export function toDatetimeLocalValue(d: Date | null | undefined, timeZone = "UTC"): string {
  return toDatetimeLocalValueInTimeZone(d, timeZone);
}
