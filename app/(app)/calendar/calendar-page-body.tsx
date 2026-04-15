import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { userHasPermission } from "@/lib/permissions";
import type { AccessUser } from "@/lib/access";
import { createCalendarEventAction, deleteCalendarEventAction, updateCalendarEventAction } from "@/app/actions/lifecycle";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CalendarSourceKind } from "@prisma/client";
import { CalendarMonthYearPicker } from "@/components/calendar-month-year-picker";
import { CalendarMonthView } from "@/components/calendar-month-view";
import { CalendarYearView } from "@/components/calendar-year-view";
import { CalendarEventAttendeesFields } from "@/components/calendar-event-attendees";
import { CalendarFormReveal } from "@/components/calendar-form-reveal";
import { calendarHref, parseSlotDay, slotDefaultsForDay } from "@/lib/calendar-nav";

function toDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  const showCreate = String(sp.create ?? "") === "1";
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

  const [monthEventsDb, yearEventsDb, listEvents, projects, inviteCandidates] = await Promise.all([
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
  ]);

  const defaultProjectId = projects.some((p) => p.id === defaultProjectIdRaw) ? defaultProjectIdRaw : "";

  const eventToEdit =
    eventIdRaw.length > 0
      ? await prisma.calendarEvent.findFirst({
          where: {
            id: eventIdRaw,
            OR: [{ organizerUserId: user.id }, { attendees: { some: { userId: user.id } } }],
          },
          include: { project: true },
        })
      : null;
  const canEditEvent = !!(eventToEdit && eventToEdit.organizerUserId === user.id);

  const slotDefaults = showCreate && slotDay != null ? slotDefaultsForDay(year, month, slotDay) : null;
  const startDefault = slotDefaults?.start ?? new Date(now.getTime() + 60 * 60000);
  const endDefault = slotDefaults?.end ?? new Date(now.getTime() + 2 * 60 * 60000);

  const monthTitle = new Date(year, month - 1).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "long",
  });
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const src = sourceId ? { sourceKind, sourceId } : {};
  const projQ = defaultProjectId ? { defaultProjectId } : {};
  const slotQ = showCreate && slotDay != null ? { slotDay } : {};
  const eventQ = eventIdRaw ? { eventId: eventIdRaw } : {};
  const prevHref = calendarHref({ y: prev.y, m: prev.m, view: "month", create: showCreate, ...src, ...projQ, ...slotQ, ...eventQ });
  const nextHref = calendarHref({ y: next.y, m: next.m, view: "month", create: showCreate, ...src, ...projQ, ...slotQ, ...eventQ });
  const todayHref = calendarHref({
    y: now.getFullYear(),
    m: now.getMonth() + 1,
    view: "month",
    create: showCreate,
    ...src,
    ...projQ,
    ...slotQ,
    ...eventQ,
  });

  const monthEvents = monthEventsDb.map((ev) => ({
    id: ev.id,
    title: ev.title,
    startsAt: ev.startsAt,
    endsAt: ev.endsAt,
    sourceKind: ev.sourceKind,
  }));

  const eventDetailHrefTemplate = calendarHref({ y: year, m: month, view: "month", eventId: "EVENT_ID_PLACEHOLDER", ...src, ...projQ });

  const yearNavPrev = calendarHref({ view: "year", y: yearForYearView - 1, create: showCreate, ...src, ...projQ, ...slotQ, ...eventQ });
  const yearNavNext = calendarHref({ view: "year", y: yearForYearView + 1, create: showCreate, ...src, ...projQ, ...slotQ, ...eventQ });
  const monthLinkFromYear = (m: number) =>
    calendarHref({ y: yearForYearView, m, view: "month", create: showCreate, ...src, ...projQ, ...slotQ, ...eventQ });

  const preserveQuery = {
    ...(showCreate ? { create: true as const } : {}),
    ...(showCreate && slotDay != null ? { slotDay } : {}),
    ...(sourceId ? { sourceKind, sourceId } : {}),
    ...(eventIdRaw ? { eventId: eventIdRaw } : {}),
    ...(defaultProjectId ? { defaultProjectId } : {}),
  };

  const cancelCreateHref = calendarHref({ y: year, m: month, view: "month", clearEvent: true, create: false, ...src, ...projQ });

  const yearPickerTitle = locale === "zh" ? `${yearForYearView}年` : String(yearForYearView);

  return (
    <div className="mx-auto max-w-[1280px] space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-[-0.03em] text-[hsl(var(--foreground))] md:text-3xl">{t(locale, "calendarPageTitle")}</h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-[hsl(var(--muted))]">{t(locale, "calendarPageLead")}</p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 rounded-[12px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2">
        <Link
          href={calendarHref({ y: year, m: month, view: "month", create: showCreate, ...src, ...projQ, ...slotQ, ...eventQ })}
          className={`rounded-full px-3 py-1.5 text-base font-medium ${view === "month" ? "bg-[hsl(var(--primary))]/12 text-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]/25" : "text-[hsl(var(--muted))] hover:bg-black/[0.04]"}`}
        >
          {t(locale, "calendarViewMonth")}
        </Link>
        <Link
          href={calendarHref({ view: "year", y: yearForYearView, ...src, create: showCreate, ...projQ, ...slotQ, ...eventQ })}
          className={`rounded-full px-3 py-1.5 text-base font-medium ${view === "year" ? "bg-[hsl(var(--primary))]/12 text-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]/25" : "text-[hsl(var(--muted))] hover:bg-black/[0.04]"}`}
        >
          {t(locale, "calendarViewYear")}
        </Link>
      </div>

      {view === "month" ? (
        <CalendarMonthView
          year={year}
          month={month}
          monthTitle={monthTitle}
          events={monthEvents}
          locale={locale}
          prevHref={prevHref}
          nextHref={nextHref}
          todayHref={todayHref}
          prevLabel={t(locale, "calendarMonthPrev")}
          nextLabel={t(locale, "calendarMonthNext")}
          todayLabel={t(locale, "calendarToday")}
          eventDetailHrefTemplate={eventDetailHrefTemplate}
          preserveQuery={preserveQuery}
          showCreate={showCreate}
          cancelCreateHref={cancelCreateHref}
          pendingOverlayLabel={locale === "zh" ? "正在更新…" : "Updating…"}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CalendarMonthYearPicker
              year={yearForYearView}
              month={month}
              monthTitle={yearPickerTitle}
              locale={locale}
              preserve={preserveQuery}
            />
            <div className="flex gap-2 text-base">
              <Link
                href={yearNavPrev}
                className="rounded-[6px] border border-[hsl(var(--border))] px-3 py-1.5 font-medium hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              >
                ‹
              </Link>
              <Link
                href={calendarHref({ y: now.getFullYear(), view: "year", create: showCreate, ...src, ...projQ, ...slotQ, ...eventQ })}
                className="rounded-[6px] border border-[hsl(var(--border))] px-3 py-1.5 font-medium hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              >
                {t(locale, "calendarToday")}
              </Link>
              <Link
                href={yearNavNext}
                className="rounded-[6px] border border-[hsl(var(--border))] px-3 py-1.5 font-medium hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              >
                ›
              </Link>
            </div>
          </div>
          <CalendarYearView year={yearForYearView} events={yearEventsDb} locale={locale} monthHref={monthLinkFromYear} />
        </div>
      )}

      {canEditEvent && eventToEdit ? (
        <CalendarFormReveal key={`edit-${eventToEdit.id}`}>
          <Card className="space-y-3 rounded-[12px] border border-[hsl(var(--border))] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="font-display text-base font-bold">{t(locale, "calendarEditEvent")}</CardTitle>
              <Link
                href={calendarHref({ y: year, m: month, view: "month", clearEvent: true, create: showCreate, ...src, ...projQ, ...slotQ })}
                className="text-base font-medium text-[hsl(var(--muted))] hover:underline"
              >
                {t(locale, "btnReset")}
              </Link>
            </div>
            <form action={updateCalendarEventAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="eventId" value={eventToEdit.id} />
            <div className="space-y-1 sm:col-span-2">
              <label className="text-base font-medium text-[hsl(var(--muted))]">{t(locale, "calendarTitle")}</label>
              <Input name="title" required className="rounded-[6px]" defaultValue={eventToEdit.title} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-base font-medium text-[hsl(var(--muted))]">Description</label>
              <Input name="description" className="rounded-[6px]" defaultValue={eventToEdit.description ?? ""} />
            </div>
            <div className="space-y-1">
              <label className="text-base font-medium text-[hsl(var(--muted))]">{t(locale, "calendarStarts")}</label>
              <Input name="startsAt" type="datetime-local" required className="rounded-[6px]" defaultValue={toDatetimeLocal(eventToEdit.startsAt)} />
            </div>
            <div className="space-y-1">
              <label className="text-base font-medium text-[hsl(var(--muted))]">{t(locale, "calendarEnds")}</label>
              <Input name="endsAt" type="datetime-local" required className="rounded-[6px]" defaultValue={toDatetimeLocal(eventToEdit.endsAt)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-base font-medium text-[hsl(var(--muted))]">{t(locale, "calendarMeetUrl")}</label>
              <Input name="meetUrl" className="rounded-[6px]" defaultValue={eventToEdit.meetUrl ?? ""} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-base font-medium text-[hsl(var(--muted))]">{t(locale, "calendarProjectOptional")}</label>
              <Select name="projectId" className="rounded-[6px]" defaultValue={eventToEdit.projectId ?? defaultProjectId}>
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.company.name} · {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <FormSubmitButton type="submit" className="rounded-[6px]" pendingLabel={t(locale, "btnSave")}>
                {t(locale, "btnSave")}
              </FormSubmitButton>
            </div>
          </form>
          <form action={deleteCalendarEventAction} className="border-t border-[hsl(var(--border))] pt-3">
            <input type="hidden" name="eventId" value={eventToEdit.id} />
            <FormSubmitButton
              type="submit"
              variant="secondary"
              className="rounded-[6px] text-rose-700 dark:text-rose-300"
              pendingLabel={t(locale, "calendarDeleteEvent")}
            >
              {t(locale, "calendarDeleteEvent")}
            </FormSubmitButton>
          </form>
          </Card>
        </CalendarFormReveal>
      ) : null}

      {showCreate && !eventIdRaw ? (
        <CalendarFormReveal key={`create-${year}-${month}-${slotDay ?? "x"}`}>
          <Card className="space-y-3 rounded-[12px] border border-[hsl(var(--border))] p-5">
            <CardTitle className="font-display text-base font-bold">{t(locale, "calendarNewEvent")}</CardTitle>
            <form action={createCalendarEventAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="sourceKind" value={sourceKind} />
            <input type="hidden" name="sourceId" value={sourceId} />
            <div className="space-y-1 sm:col-span-2">
              <label className="text-base font-medium text-[hsl(var(--muted))]">{t(locale, "calendarTitle")}</label>
              <Input name="title" required className="rounded-[6px]" defaultValue="" placeholder="1:1 / Check-in" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-base font-medium text-[hsl(var(--muted))]">Description</label>
              <Input name="description" className="rounded-[6px]" />
            </div>
            <div className="space-y-1">
              <label className="text-base font-medium text-[hsl(var(--muted))]">{t(locale, "calendarStarts")}</label>
              <Input name="startsAt" type="datetime-local" required className="rounded-[6px]" defaultValue={toDatetimeLocal(startDefault)} />
            </div>
            <div className="space-y-1">
              <label className="text-base font-medium text-[hsl(var(--muted))]">{t(locale, "calendarEnds")}</label>
              <Input name="endsAt" type="datetime-local" required className="rounded-[6px]" defaultValue={toDatetimeLocal(endDefault)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-base font-medium text-[hsl(var(--muted))]">{t(locale, "calendarMeetUrl")}</label>
              <Input name="meetUrl" className="rounded-[6px]" placeholder="https://…" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-base font-medium text-[hsl(var(--muted))]">{t(locale, "calendarProjectOptional")}</label>
              <Select name="projectId" className="rounded-[6px]" defaultValue={defaultProjectId}>
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.company.name} · {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <CalendarEventAttendeesFields
              staffOptions={inviteCandidates.map((u) => ({ id: u.id, name: u.name, email: u.email }))}
              organizerUserId={user.id}
              labels={{
                staffTitle: t(locale, "calendarAttendees"),
                staffSearch: t(locale, "calendarAttendeesStaffSearch"),
                staffHint: t(locale, "calendarAttendeesStaffHint"),
                externalTitle: t(locale, "calendarAttendeesExternal"),
                externalHint: t(locale, "calendarAttendeesExternalHint"),
              }}
            />
            <div className="sm:col-span-2">
              <FormSubmitButton type="submit" className="rounded-[6px]" pendingLabel={t(locale, "calendarCreate")}>
                {t(locale, "calendarCreate")}
              </FormSubmitButton>
            </div>
          </form>
          </Card>
        </CalendarFormReveal>
      ) : null}

      <Card className="rounded-[12px] border border-[hsl(var(--border))] p-5">
        <CardTitle className="font-display mb-3 text-base font-bold">
          {t(locale, "calendarPageTitle")} — {t(locale, "calendarUpcomingList")}
        </CardTitle>
        {!listEvents.length ? (
          <p className="text-base text-[hsl(var(--muted))]">{t(locale, "calendarEmpty")}</p>
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))]">
            {listEvents.map((ev) => (
              <li key={ev.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0">
                <div>
                  <p className="font-medium text-[hsl(var(--foreground))]">{ev.title}</p>
                  <p className="text-base text-[hsl(var(--muted))]">
                    {ev.startsAt.toISOString().slice(0, 16).replace("T", " ")} → {ev.endsAt.toISOString().slice(0, 16).replace("T", " ")} ·{" "}
                    {ev.organizer.name}
                  </p>
                  {ev.project ? (
                    <p className="mt-1 text-base">
                      <Link className="text-[hsl(var(--primary))] hover:underline" href={`/projects/${ev.project.id}`}>
                        {ev.project.name}
                      </Link>
                    </p>
                  ) : null}
                  {ev.meetUrl ? (
                    <a
                      href={ev.meetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-base font-medium text-[hsl(var(--primary))] hover:underline"
                    >
                      Meet
                    </a>
                  ) : null}
                  {ev.externalAttendeeEmails?.length ? (
                    <p className="mt-1 text-sm text-[hsl(var(--muted))]">
                      {t(locale, "calendarExternalGuestsCount").replace("{n}", String(ev.externalAttendeeEmails.length))}
                    </p>
                  ) : null}
                  {ev.organizerUserId === user.id ? (
                    <p className="mt-2">
                      <Link
                        href={calendarHref({
                          y: new Date(ev.startsAt).getFullYear(),
                          m: new Date(ev.startsAt).getMonth() + 1,
                          view: "month",
                          eventId: ev.id,
                          ...src,
                          ...projQ,
                        })}
                        className="text-base font-semibold text-[hsl(var(--primary))] hover:underline"
                      >
                        {t(locale, "calendarEditEvent")}
                      </Link>
                    </p>
                  ) : null}
                </div>
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-base font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {ev.sourceKind}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
