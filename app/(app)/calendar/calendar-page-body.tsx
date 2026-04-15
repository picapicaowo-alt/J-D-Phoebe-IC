import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { userHasPermission } from "@/lib/permissions";
import type { AccessUser } from "@/lib/access";
import { CalendarSourceKind } from "@prisma/client";
import { CalendarDashboardClient } from "@/components/calendar-dashboard-client";
import { calendarHref, parseSlotDay, slotDefaultsForDay } from "@/lib/calendar-nav";

function clampMonth(y: number, m: number) {
  const now = new Date();
  const year = Number.isFinite(y) && y >= 1970 && y <= 2100 ? y : now.getFullYear();
  const month = Number.isFinite(m) && m >= 1 && m <= 12 ? m : now.getMonth() + 1;
  return { year, month };
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
  const sp = await searchParams;
  const urlCreate = String(sp.create ?? "") === "1";
  const slotDay = parseSlotDay(sp.slotDay);
  const defaultProjectIdRaw = String(sp.defaultProjectId ?? "").trim();
  const sourceKind = (String(sp.sourceKind ?? "MANUAL").trim() || "MANUAL") as CalendarSourceKind;
  const sourceId = String(sp.sourceId ?? "").trim() || "";
  const view = String(sp.view ?? "").trim() === "year" ? ("year" as const) : ("month" as const);

  const now = new Date();
  const yRaw = Number.parseInt(String(sp.y ?? ""), 10);
  const mRaw = Number.parseInt(String(sp.m ?? ""), 10);
  const { year, month } = clampMonth(yRaw, mRaw);
  const yearForYearView = Number.isFinite(yRaw) && yRaw >= 1970 && yRaw <= 2100 ? yRaw : now.getFullYear();

  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
  const yearStart = new Date(yearForYearView, 0, 1, 0, 0, 0, 0);
  const yearEnd = new Date(yearForYearView, 11, 31, 23, 59, 59, 999);

  const horizon = new Date(now.getTime() + 90 * 86400000);
  const attendeeScope = { OR: [{ organizerUserId: user.id }, { attendees: { some: { userId: user.id } } }] };

  const eventIdRaw = String(sp.eventId ?? "").trim();

  const companyIds = [...new Set(user.companyMemberships.map((m) => m.companyId))];
  const inviteCandidatesPromise =
    user.isSuperAdmin || !companyIds.length
      ? prisma.user.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true, email: true },
          orderBy: { name: "asc" },
          take: 400,
        })
      : prisma.user.findMany({
          where: {
            deletedAt: null,
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
          include: { project: true },
        })
      : Promise.resolve(null);

  const [monthEventsDb, yearEventsDb, listEvents, projects, inviteCandidates, bootstrapEventRow] = await Promise.all([
    view === "month"
      ? prisma.calendarEvent.findMany({
          where: {
            ...attendeeScope,
            startsAt: { lte: monthEnd },
            endsAt: { gte: monthStart },
          },
          include: { organizer: true, attendees: { include: { user: true } }, project: true },
          orderBy: { startsAt: "asc" },
          take: 200,
        })
      : Promise.resolve([]),
    view === "year"
      ? prisma.calendarEvent.findMany({
          where: {
            ...attendeeScope,
            startsAt: { lte: yearEnd },
            endsAt: { gte: yearStart },
          },
          select: { id: true, title: true, startsAt: true },
          orderBy: { startsAt: "asc" },
          take: 800,
        })
      : Promise.resolve([]),
    prisma.calendarEvent.findMany({
      where: {
        ...attendeeScope,
        startsAt: { gte: new Date(now.getTime() - 2 * 86400000), lte: horizon },
      },
      include: { organizer: true, attendees: { include: { user: true } }, project: true },
      orderBy: { startsAt: "asc" },
      take: 100,
    }),
    prisma.project.findMany({
      where: { deletedAt: null },
      include: { company: true },
      orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
      take: 80,
    }),
    inviteCandidatesPromise,
    bootstrapEventPromise,
  ]);

  const defaultProjectId = projects.some((p) => p.id === defaultProjectIdRaw) ? defaultProjectIdRaw : "";

  const slotDefaults = slotDay != null ? slotDefaultsForDay(year, month, slotDay) : null;
  const startDefault = slotDefaults?.start ?? new Date(now.getTime() + 60 * 60000);
  const endDefault = slotDefaults?.end ?? new Date(now.getTime() + 2 * 60 * 60000);

  const bootstrapCreate =
    urlCreate && !eventIdRaw ? { startIso: startDefault.toISOString(), endIso: endDefault.toISOString() } : null;

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
    y: now.getFullYear(),
    m: now.getMonth() + 1,
    view: "month",
    ...src,
    ...projQ,
  });

  const cleanHrefForModal = calendarHref({ y: year, m: month, view: "month", ...src, ...projQ });

  const monthEventsPayload = monthEventsDb.map((ev) => ({
    id: ev.id,
    title: ev.title,
    startsAt: ev.startsAt.toISOString(),
    endsAt: ev.endsAt.toISOString(),
    sourceKind: ev.sourceKind,
    canEdit: ev.organizerUserId === user.id,
    description: ev.description ?? null,
    meetUrl: ev.meetUrl ?? null,
    projectId: ev.projectId ?? null,
  }));

  const yearEventsPayload = yearEventsDb.map((ev) => ({
    id: ev.id,
    title: ev.title,
    startsAt: ev.startsAt.toISOString(),
  }));

  const projectOptions = projects.map((p) => ({ id: p.id, label: `${p.company.name} · ${p.name}` }));

  const listEventsPayload = listEvents.map((ev) => ({
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
          }
        : null,
  }));

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
        listEvents={listEventsPayload}
      />
    </div>
  );
}
