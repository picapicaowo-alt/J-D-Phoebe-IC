export function countdownPhrase(deadline: Date | null | undefined, now = new Date()) {
  if (!deadline) return "No deadline";

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  const diffDays = Math.round((startOfDue.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays > 1) return `${diffDays} days left`;
  if (diffDays === 1) return "1 day left";
  if (diffDays === 0) return "Due today";
  if (diffDays === -1) return "Overdue by 1 day";
  return `Overdue by ${Math.abs(diffDays)} days`;
}

export function isOverdue(deadline: Date | null | undefined, now = new Date()) {
  if (!deadline) return false;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  return startOfDue.getTime() < startOfToday.getTime();
}

/** Value for `<input type="datetime-local" />` in the browser's local timezone. */
export function toDatetimeLocalValue(d: Date | null | undefined): string {
  if (!d) return "";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}
