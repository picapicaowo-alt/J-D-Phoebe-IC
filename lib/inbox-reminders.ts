import { prisma } from "@/lib/prisma";

export type UpcomingReminder =
  | {
      kind: "TODO_DUE";
      id: string;
      title: string;
      at: Date;
      projectId: string;
      projectName: string | null;
      href: string;
    }
  | {
      kind: "MEETING";
      id: string;
      title: string;
      at: Date;
      projectId: string | null;
      projectName: string | null;
      href: string;
    };

export async function getUpcomingInboxReminders(userId: string, opts?: { windowDays?: number; limitPerKind?: number }) {
  const windowDays = Math.max(1, Math.min(30, opts?.windowDays ?? 7));
  const limitPerKind = Math.max(1, Math.min(100, opts?.limitPerKind ?? 12));
  const now = new Date();
  const horizon = new Date(now.getTime() + windowDays * 86400000);

  const [todos, meetings] = await Promise.all([
    prisma.workflowNode.findMany({
      where: {
        deletedAt: null,
        dueAt: { gte: now, lte: horizon },
        status: { notIn: ["DONE", "SKIPPED"] },
        assignees: { some: { userId } },
      },
      select: {
        id: true,
        title: true,
        dueAt: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: { dueAt: "asc" },
      take: limitPerKind,
    }),
    prisma.calendarEvent.findMany({
      where: {
        startsAt: { gte: now, lte: horizon },
        OR: [{ organizerUserId: userId }, { attendees: { some: { userId } } }],
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: { startsAt: "asc" },
      take: limitPerKind,
    }),
  ]);

  const todoItems: UpcomingReminder[] = todos
    .filter((row): row is typeof row & { dueAt: Date } => !!row.dueAt)
    .map((row) => ({
      kind: "TODO_DUE",
      id: row.id,
      title: row.title,
      at: row.dueAt,
      projectId: row.project.id,
      projectName: row.project.name,
      href: `/projects/${row.project.id}`,
    }));

  const meetingItems: UpcomingReminder[] = meetings.map((row) => ({
    kind: "MEETING",
    id: row.id,
    title: row.title,
    at: row.startsAt,
    projectId: row.project?.id ?? null,
    projectName: row.project?.name ?? null,
    href: `/calendar?eventId=${row.id}`,
  }));

  return [...todoItems, ...meetingItems].sort((a, b) => a.at.getTime() - b.at.getTime());
}
