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
