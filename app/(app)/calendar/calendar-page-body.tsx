import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { userHasPermission } from "@/lib/permissions";
import { projectVisibilityWhere, type AccessUser } from "@/lib/access";
import { CalendarSourceKind } from "@prisma/client";
import { CalendarDashboardClient } from "@/components/calendar-dashboard-client";
import { calendarHref, parseSlotDay } from "@/lib/calendar-nav";
import { ensureDefaultCalendarLabels } from "@/lib/calendar-labels";
import {
  buildDatetimeLocalValue,
  getMonthRangeInTimeZone,
  getYearRangeInTimeZone,
  getZonedDateParts,
  toDatetimeLocalValueInTimeZone,
} from "@/lib/timezone";

function clampMonth(y: number, m: number, fallbackYear: number, fallbackMonth: number) {
  const year = Number.isFinite(y) && y >= 1970 && y <= 2100 ? y : fallbackYear;
  const month = Number.isFinite(m) && m >= 1 && m <= 12 ? m : fallbackMonth;
  return { year, month };
}

function deadlineEnd(d: Date) {
  return new Date(d.getTime() + 30 * 60000);
}

function labelPayload(label: { name: string; color: string } | null | undefined) {
  return label ? { name: label.name, color: label.color } : null;
}

export async function CalendarPageBody({
  searchParams,
}: {
  searchParams: Promise<{
    create?: string;
    sourceKind?: string;
    sourceId?: string;
    y?: string;
    m?: string;
    view?: string;
    eventId?: string;
    defaultProjectId?: string;
    slotDay?: string;
  }>;
}) {
  const user = (await requireUser()) as AccessUser;
  const canRead = await userHasPermission(user, "project.read");
  if (!canRead) redirect("/group");
  const locale = await getLocale();
  await ensureDefaultCalendarLabels();
  const sp = await searchParams;
  const urlCreate = String(sp.create ?? "") === "1";
  const slotDay = parseSlotDay(sp.slotDay);
  const defaultProjectIdRaw = String(sp.defaultProjectId ?? "").trim();
  const sourceKind = (String(sp.sourceKind ?? "MANUAL").trim() || "MANUAL") as CalendarSourceKind;
  const sourceId = String(sp.sourceId ?? "").trim() || "";
  const view = String(sp.view ?? "").trim() === "year" ? ("year" as const) : ("month" as const);

  const now = new Date();
  const nowParts = getZonedDateParts(now, user.timezone) ?? {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
    second: now.getSeconds(),
  };
  const yRaw = Number.parseInt(String(sp.y ?? ""), 10);
  const mRaw = Number.parseInt(String(sp.m ?? ""), 10);
  const { year, month } = clampMonth(yRaw, mRaw, nowParts.year, nowParts.month);
  const yearForYearView = Number.isFinite(yRaw) && yRaw >= 1970 && yRaw <= 2100 ? yRaw : nowParts.year;

  const { start: monthStart, end: monthEnd } = getMonthRangeInTimeZone(year, month, user.timezone);
  const { start: yearStart, end: yearEnd } = getYearRangeInTimeZone(yearForYearView, user.timezone);

  const horizon = new Date(now.getTime() + 90 * 86400000);
  const attendeeScope = { OR: [{ organizerUserId: user.id }, { attendees: { some: { userId: user.id } } }] };
  const visibleProjectWhere = projectVisibilityWhere(user);

  const eventIdRaw = String(sp.eventId ?? "").trim();

  const companyIds = [...new Set(user.companyMemberships.map((m) => m.companyId))];
  const inviteCandidatesPromise =
    user.isSuperAdmin || !companyIds.length
      ? prisma.user.findMany({
          where: { deletedAt: null, active: true },
          select: { id: true, name: true, email: true },
          orderBy: { name: "asc" },
          take: 400,
        })
      : prisma.user.findMany({
          where: {
            deletedAt: null,
            active: true,
            companyMemberships: { some: { companyId: { in: companyIds } } },
          },
          select: { id: true, name: true, email: true },
          orderBy: { name: "asc" },
          take: 400,
        });

  const bootstrapEventPromise =
    eventIdRaw.length > 0
      ? prisma.calendarEvent.findFirst({
          where: {
            id: eventIdRaw,
            OR: [{ organizerUserId: user.id }, { attendees: { some: { userId: user.id } } }],
          },
          include: { project: true, attendees: { select: { userId: true } }, label: true },
        })
      : Promise.resolve(null);

  const [
    labels,
    monthEventsDb,
    monthProjectDeadlines,
    monthTaskDeadlines,
    yearEventsDb,
    yearProjectDeadlines,
    yearTaskDeadlines,
    listEvents,
    listProjectDeadlines,
    listTaskDeadlines,
    projects,
    inviteCandidates,
    bootstrapEventRow,
  ] = await Promise.all([
    prisma.calendarLabel.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, key: true, name: true, color: true, isDefault: true },
    }),
    view === "month"
      ? prisma.calendarEvent.findMany({
          where: {
            ...attendeeScope,
            startsAt: { lte: monthEnd },
            endsAt: { gte: monthStart },
          },
          include: { organizer: true, attendees: { include: { user: true } }, project: true, label: true },
          orderBy: { startsAt: "asc" },
          take: 200,
        })
      : Promise.resolve([]),
    view === "month"
      ? prisma.project.findMany({
          where: { ...visibleProjectWhere, deletedAt: null, deadline: { gte: monthStart, lte: monthEnd } },
          select: { id: true, name: true, deadline: true },
          orderBy: { deadline: "asc" },
          take: 300,
        })
      : Promise.resolve([]),
    view === "month"
      ? prisma.workflowNode.findMany({
          where: {
            deletedAt: null,
            dueAt: { gte: monthStart, lte: monthEnd },
            project: { ...visibleProjectWhere, deletedAt: null },
          },
          select: { id: true, title: true, dueAt: true, project: { select: { id: true, name: true } } },
          orderBy: { dueAt: "asc" },
          take: 500,
        })
      : Promise.resolve([]),
    view === "year"
      ? prisma.calendarEvent.findMany({
          where: {
            ...attendeeScope,
            startsAt: { lte: yearEnd },
            endsAt: { gte: yearStart },
          },
          select: { id: true, title: true, startsAt: true, projectId: true, label: { select: { name: true, color: true } } },
          orderBy: { startsAt: "asc" },
          take: 800,
        })
      : Promise.resolve([]),
    view === "year"
      ? prisma.project.findMany({
          where: { ...visibleProjectWhere, deletedAt: null, deadline: { gte: yearStart, lte: yearEnd } },
          select: { id: true, name: true, deadline: true },
          orderBy: { deadline: "asc" },
          take: 1000,
        })
      : Promise.resolve([]),
    view === "year"
      ? prisma.workflowNode.findMany({
          where: {
            deletedAt: null,
            dueAt: { gte: yearStart, lte: yearEnd },
            project: { ...visibleProjectWhere, deletedAt: null },
          },
          select: { id: true, title: true, dueAt: true, project: { select: { id: true, name: true } } },
          orderBy: { dueAt: "asc" },
          take: 1400,
        })
      : Promise.resolve([]),
    prisma.calendarEvent.findMany({
      where: {
        ...attendeeScope,
        startsAt: { gte: new Date(now.getTime() - 2 * 86400000), lte: horizon },
      },
      include: { organizer: true, attendees: { include: { user: true } }, project: true, label: true },
      orderBy: { startsAt: "asc" },
      take: 100,
    }),
    prisma.project.findMany({
      where: {
        ...visibleProjectWhere,
        deletedAt: null,
        deadline: { gte: new Date(now.getTime() - 2 * 86400000), lte: horizon },
      },
      select: { id: true, name: true, deadline: true },
      orderBy: { deadline: "asc" },
      take: 200,
    }),
    prisma.workflowNode.findMany({
      where: {
        deletedAt: null,
        dueAt: { gte: new Date(now.getTime() - 2 * 86400000), lte: horizon },
        project: { ...visibleProjectWhere, deletedAt: null },
      },
      select: { id: true, title: true, dueAt: true, project: { select: { id: true, name: true } } },
      orderBy: { dueAt: "asc" },
      take: 300,
    }),
    prisma.project.findMany({
      where: { ...visibleProjectWhere, deletedAt: null },
      include: { company: true },
      orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
      take: 80,
    }),
    inviteCandidatesPromise,
    bootstrapEventPromise,
  ]);

  const defaultProjectId = projects.some((p) => p.id === defaultProjectIdRaw) ? defaultProjectIdRaw : "";

  const slotDefaults =
    slotDay != null
      ? {
          startLocal: buildDatetimeLocalValue({ year, month, day: slotDay, hour: 9, minute: 0 }),
          endLocal: buildDatetimeLocalValue({ year, month, day: slotDay, hour: 10, minute: 0 }),
        }
      : null;
  const startDefaultLocal = slotDefaults?.startLocal ?? toDatetimeLocalValueInTimeZone(new Date(now.getTime() + 60 * 60000), user.timezone);
  const endDefaultLocal = slotDefaults?.endLocal ?? toDatetimeLocalValueInTimeZone(new Date(now.getTime() + 2 * 60 * 60000), user.timezone);

  const bootstrapCreate =
    urlCreate && !eventIdRaw ? { startLocal: startDefaultLocal, endLocal: endDefaultLocal } : null;

  const bootstrapEdit =
    bootstrapEventRow && bootstrapEventRow.organizerUserId === user.id
      ? {
          id: bootstrapEventRow.id,
          title: bootstrapEventRow.title,
          startsAt: bootstrapEventRow.startsAt.toISOString(),
          endsAt: bootstrapEventRow.endsAt.toISOString(),
          description: bootstrapEventRow.description ?? null,
          meetUrl: bootstrapEventRow.meetUrl ?? null,
          projectId: bootstrapEventRow.projectId ?? null,
          labelId: bootstrapEventRow.labelId ?? null,
          attendeeIds: bootstrapEventRow.attendees.map((a) => a.userId),
          externalAttendeeEmails: bootstrapEventRow.externalAttendeeEmails ?? [],
        }
      : null;

  const shouldStripModalQuery = urlCreate || !!eventIdRaw;

  const monthTitle = new Date(year, month - 1).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "long",
  });
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const src = sourceId ? { sourceKind, sourceId } : {};
  const projQ = defaultProjectId ? { defaultProjectId } : {};

  const prevHref = calendarHref({ y: prev.y, m: prev.m, view: "month", ...src, ...projQ });
  const nextHref = calendarHref({ y: next.y, m: next.m, view: "month", ...src, ...projQ });
  const todayHref = calendarHref({
    y: nowParts.year,
    m: nowParts.month,
    view: "month",
    ...src,
    ...projQ,
  });

  const cleanHrefForModal = calendarHref({ y: year, m: month, view: "month", ...src, ...projQ });

  const meetingLabel = labels.find((label) => label.key === "meeting") ?? labels[0] ?? null;
  const projectLabel = labels.find((label) => label.key === "project") ?? meetingLabel;
  const deadlineLabel = labels.find((label) => label.key === "deadline") ?? projectLabel;
  const labelOptions = labels.map((label) => ({
    id: label.id,
    key: label.key,
    name: label.name,
    color: label.color,
    isDefault: label.isDefault,
  }));
  const eventLabel = (label: { name: string; color: string } | null | undefined, hasProject: boolean) =>
    labelPayload(label ?? (hasProject ? projectLabel : meetingLabel));

  const monthManualEvents = monthEventsDb.map((ev) => ({
    id: ev.id,
    title: ev.title,
    startsAt: ev.startsAt.toISOString(),
    endsAt: ev.endsAt.toISOString(),
    sourceKind: ev.sourceKind,
    canEdit: ev.organizerUserId === user.id,
    description: ev.description ?? null,
    meetUrl: ev.meetUrl ?? null,
    projectId: ev.projectId ?? null,
    labelId: ev.labelId ?? null,
    label: eventLabel(ev.label, !!ev.projectId),
    href: null,
    attendeeIds: ev.attendees.map((a) => a.userId),
    externalAttendeeEmails: ev.externalAttendeeEmails ?? [],
  }));
  const monthProjectDeadlineEvents = monthProjectDeadlines
    .filter((p) => p.deadline)
    .map((p) => ({
      id: `project-deadline:${p.id}`,
      title: `${p.name} · ${t(locale, "calendarProjectDeadline")}`,
      startsAt: p.deadline!.toISOString(),
      endsAt: deadlineEnd(p.deadline!).toISOString(),
      sourceKind: "PROJECT_DEADLINE",
      canEdit: false,
      description: null,
      meetUrl: null,
      projectId: p.id,
      labelId: deadlineLabel?.id ?? null,
      label: labelPayload(deadlineLabel),
      href: `/projects/${p.id}`,
      attendeeIds: [],
      externalAttendeeEmails: [],
    }));
  const monthTaskDeadlineEvents = monthTaskDeadlines
    .filter((n) => n.dueAt)
    .map((n) => ({
      id: `task-deadline:${n.id}`,
      title: `${n.title} · ${n.project.name}`,
      startsAt: n.dueAt!.toISOString(),
      endsAt: deadlineEnd(n.dueAt!).toISOString(),
      sourceKind: "TASK_DEADLINE",
      canEdit: false,
      description: null,
      meetUrl: null,
      projectId: n.project.id,
      labelId: deadlineLabel?.id ?? null,
      label: labelPayload(deadlineLabel),
      href: `/projects/${n.project.id}`,
      attendeeIds: [],
      externalAttendeeEmails: [],
    }));
  const monthEventsPayload = [...monthManualEvents, ...monthProjectDeadlineEvents, ...monthTaskDeadlineEvents].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );

  const yearManualEvents = yearEventsDb.map((ev) => ({
    id: ev.id,
    title: ev.title,
    startsAt: ev.startsAt.toISOString(),
    label: eventLabel(ev.label, !!ev.projectId),
  }));
  const yearProjectDeadlineEvents = yearProjectDeadlines
    .filter((p) => p.deadline)
    .map((p) => ({
      id: `project-deadline:${p.id}`,
      title: `${p.name} · ${t(locale, "calendarProjectDeadline")}`,
      startsAt: p.deadline!.toISOString(),
      label: labelPayload(deadlineLabel),
    }));
  const yearTaskDeadlineEvents = yearTaskDeadlines
    .filter((n) => n.dueAt)
    .map((n) => ({
      id: `task-deadline:${n.id}`,
      title: `${n.title} · ${n.project.name}`,
      startsAt: n.dueAt!.toISOString(),
      label: labelPayload(deadlineLabel),
    }));
  const yearEventsPayload = [...yearManualEvents, ...yearProjectDeadlineEvents, ...yearTaskDeadlineEvents].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );

  const projectOptions = projects.map((p) => ({ id: p.id, label: `${p.company.name} · ${p.name}` }));

  const listManualEvents = listEvents.map((ev) => ({
    id: ev.id,
    title: ev.title,
    startsAtIso: ev.startsAt.toISOString(),
    endsAtIso: ev.endsAt.toISOString(),
    organizerName: ev.organizer.name,
    organizerUserId: ev.organizerUserId,
    sourceKind: ev.sourceKind,
    meetUrl: ev.meetUrl,
    project: ev.project ? { id: ev.project.id, name: ev.project.name } : null,
    externalCount: ev.externalAttendeeEmails?.length ?? 0,
    label: eventLabel(ev.label, !!ev.projectId),
    href: null,
    isGenerated: false,
    edit:
      ev.organizerUserId === user.id
        ? {
            id: ev.id,
            title: ev.title,
            startsAt: ev.startsAt.toISOString(),
            endsAt: ev.endsAt.toISOString(),
            description: ev.description ?? null,
            meetUrl: ev.meetUrl ?? null,
            projectId: ev.projectId ?? null,
            labelId: ev.labelId ?? null,
            attendeeIds: ev.attendees.map((a) => a.userId),
            externalAttendeeEmails: ev.externalAttendeeEmails ?? [],
          }
        : null,
  }));
  const listProjectDeadlineEvents = listProjectDeadlines
    .filter((p) => p.deadline)
    .map((p) => ({
      id: `project-deadline:${p.id}`,
      title: `${p.name} · ${t(locale, "calendarProjectDeadline")}`,
      startsAtIso: p.deadline!.toISOString(),
      endsAtIso: deadlineEnd(p.deadline!).toISOString(),
      organizerName: null,
      organizerUserId: null,
      sourceKind: "PROJECT_DEADLINE",
      meetUrl: null,
      project: { id: p.id, name: p.name },
      externalCount: 0,
      label: labelPayload(deadlineLabel),
      href: `/projects/${p.id}`,
      isGenerated: true,
      edit: null,
    }));
  const listTaskDeadlineEvents = listTaskDeadlines
    .filter((n) => n.dueAt)
    .map((n) => ({
      id: `task-deadline:${n.id}`,
      title: `${n.title} · ${t(locale, "calendarTaskDeadline")}`,
      startsAtIso: n.dueAt!.toISOString(),
      endsAtIso: deadlineEnd(n.dueAt!).toISOString(),
      organizerName: null,
      organizerUserId: null,
      sourceKind: "TASK_DEADLINE",
      meetUrl: null,
      project: { id: n.project.id, name: n.project.name },
      externalCount: 0,
      label: labelPayload(deadlineLabel),
      href: `/projects/${n.project.id}`,
      isGenerated: true,
      edit: null,
    }));
  const listEventsPayload = [...listManualEvents, ...listProjectDeadlineEvents, ...listTaskDeadlineEvents]
    .sort((a, b) => Date.parse(a.startsAtIso) - Date.parse(b.startsAtIso))
    .slice(0, 120);

  const yearPickerTitle = locale === "zh" ? `${yearForYearView}年` : String(yearForYearView);

  const navContext = {
    ...(sourceId ? { sourceKind, sourceId } : {}),
    ...(defaultProjectId ? { defaultProjectId } : {}),
  };

  return (
    <div className="mx-auto max-w-[1280px] space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-[-0.03em] text-[hsl(var(--foreground))] md:text-3xl">{t(locale, "calendarPageTitle")}</h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-[hsl(var(--muted))]">{t(locale, "calendarPageLead")}</p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 rounded-[12px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2">
        <Link
          href={calendarHref({ y: year, m: month, view: "month", create: true, ...src, ...projQ })}
          className="rounded-full bg-[hsl(var(--foreground))] px-3 py-1.5 text-base font-semibold text-[hsl(var(--background))] hover:opacity-90"
        >
          {t(locale, "calendarScheduleMeeting")}
        </Link>
        <Link
          href={calendarHref({ y: year, m: month, view: "month", ...src, ...projQ })}
          className={`rounded-full px-3 py-1.5 text-base font-medium ${view === "month" ? "bg-[hsl(var(--primary))]/12 text-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]/25" : "text-[hsl(var(--muted))] hover:bg-black/[0.04]"}`}
        >
          {t(locale, "calendarViewMonth")}
        </Link>
        <Link
          href={calendarHref({ view: "year", y: yearForYearView, ...src, ...projQ })}
          className={`rounded-full px-3 py-1.5 text-base font-medium ${view === "year" ? "bg-[hsl(var(--primary))]/12 text-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]/25" : "text-[hsl(var(--muted))] hover:bg-black/[0.04]"}`}
        >
          {t(locale, "calendarViewYear")}
        </Link>
      </div>

      <CalendarDashboardClient
        locale={locale}
        userTimeZone={user.timezone}
        view={view}
        userId={user.id}
        navContext={navContext}
        sourceKind={sourceKind}
        sourceId={sourceId}
        defaultProjectId={defaultProjectId}
        year={year}
        month={month}
        monthTitle={monthTitle}
        monthEventsPayload={monthEventsPayload}
        prevHref={prevHref}
        nextHref={nextHref}
        todayHref={todayHref}
        yearForYearView={yearForYearView}
        yearEventsPayload={yearEventsPayload}
        yearPickerTitle={yearPickerTitle}
        bootstrapCreate={bootstrapCreate}
        bootstrapEdit={bootstrapEdit}
        shouldStripModalQuery={shouldStripModalQuery}
        cleanHrefForModal={cleanHrefForModal}
        projects={projectOptions}
        inviteCandidates={inviteCandidates}
        labels={labelOptions}
        listEvents={listEventsPayload}
      />
    </div>
  );
}
