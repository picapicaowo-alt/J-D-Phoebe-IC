"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import {
  createCalendarEventAction,
  createCalendarLabelAction,
  deleteCalendarEventAction,
  updateCalendarEventAction,
  updateCalendarLabelAction,
} from "@/app/actions/lifecycle";
import { CalendarEventAttendeesFields } from "@/components/calendar-event-attendees";
import { CalendarMonthYearPicker } from "@/components/calendar-month-year-picker";
import { CalendarMonthView, type CalendarMonthEvent } from "@/components/calendar-month-view";
import { CalendarYearView } from "@/components/calendar-year-view";
import { CloseDialogButton } from "@/components/dialog-launcher";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { calendarHref, slotDefaultsForDay } from "@/lib/calendar-nav";
import { t } from "@/lib/messages";

const CREATE_DIALOG_ID = "calendar-modal-create";
const EDIT_DIALOG_ID = "calendar-modal-edit";

function toDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type CalendarEditEventPayload = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  description: string | null;
  meetUrl: string | null;
  projectId: string | null;
  labelId: string | null;
  attendeeIds: string[];
  externalAttendeeEmails: string[];
};

export type CalendarBootstrapCreate = { startIso: string; endIso: string };

export type CalendarNavContext = {
  sourceKind?: string;
  sourceId?: string;
  defaultProjectId?: string;
};

export type CalendarListEventPayload = {
  id: string;
  title: string;
  startsAtIso: string;
  endsAtIso: string;
  organizerName: string | null;
  organizerUserId: string | null;
  sourceKind: string;
  meetUrl: string | null;
  project: { id: string; name: string } | null;
  externalCount: number;
  label: { name: string; color: string } | null;
  href: string | null;
  isGenerated: boolean;
  edit: CalendarEditEventPayload | null;
};

export type CalendarProjectOption = { id: string; label: string };

export type CalendarInviteeOption = { id: string; name: string; email: string };

export type CalendarLabelOption = { id: string; key: string | null; name: string; color: string; isDefault: boolean };

/** Serializable month cell event row (ISO date strings). */
export type CalendarMonthEventRowPayload = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  sourceKind: string;
  canEdit: boolean;
  description: string | null;
  meetUrl: string | null;
  projectId: string | null;
  labelId: string | null;
  label: { name: string; color: string } | null;
  href: string | null;
  attendeeIds: string[];
  externalAttendeeEmails: string[];
};

export function CalendarDashboardClient({
  locale,
  view,
  userId,
  navContext,
  sourceKind,
  sourceId,
  defaultProjectId,
  year,
  month,
  monthTitle,
  monthEventsPayload,
  prevHref,
  nextHref,
  todayHref,
  yearForYearView,
  yearEventsPayload,
  yearPickerTitle,
  bootstrapCreate,
  bootstrapEdit,
  shouldStripModalQuery,
  cleanHrefForModal,
  projects,
  inviteCandidates,
  labels,
  listEvents,
}: {
  locale: "en" | "zh";
  view: "month" | "year";
  userId: string;
  navContext: CalendarNavContext;
  sourceKind: string;
  sourceId: string;
  defaultProjectId: string;
  year: number;
  month: number;
  monthTitle: string;
  monthEventsPayload: CalendarMonthEventRowPayload[];
  prevHref: string;
  nextHref: string;
  todayHref: string;
  yearForYearView: number;
  yearEventsPayload: { id: string; title: string; startsAt: string; label: { name: string; color: string } | null }[];
  yearPickerTitle: string;
  bootstrapCreate: CalendarBootstrapCreate | null;
  bootstrapEdit: CalendarEditEventPayload | null;
  shouldStripModalQuery: boolean;
  cleanHrefForModal: string;
  projects: CalendarProjectOption[];
  inviteCandidates: CalendarInviteeOption[];
  labels: CalendarLabelOption[];
  listEvents: CalendarListEventPayload[];
}) {
  const router = useRouter();
  const [navPending, startNavTransition] = useTransition();
  const [mutationPending, startMutationTransition] = useTransition();

  const [editSnapshot, setEditSnapshot] = useState<CalendarEditEventPayload | null>(null);

  const [createStart, setCreateStart] = useState("");
  const [createEnd, setCreateEnd] = useState("");
  const [createFormKey, setCreateFormKey] = useState(0);

  const openedBootstrap = useRef(false);
  const defaultMeetingLabelId = labels.find((label) => label.key === "meeting")?.id ?? labels[0]?.id ?? "";
  const defaultProjectLabelId = labels.find((label) => label.key === "project")?.id ?? defaultMeetingLabelId;
  const defaultCreateLabelId = defaultProjectId ? defaultProjectLabelId : defaultMeetingLabelId;

  const monthEvents: CalendarMonthEvent[] = monthEventsPayload.map((e) => ({
    ...e,
    startsAt: new Date(e.startsAt),
    endsAt: new Date(e.endsAt),
  }));

  const yearEvents = yearEventsPayload.map((e) => ({
    ...e,
    startsAt: new Date(e.startsAt),
  }));

  const pushRoute = useCallback(
    (href: string) => {
      startNavTransition(() => {
        router.push(href);
      });
    },
    [router],
  );

  useEffect(() => {
    if (!shouldStripModalQuery) return;
    router.replace(cleanHrefForModal, { scroll: false });
  }, [router, shouldStripModalQuery, cleanHrefForModal]);

  useLayoutEffect(() => {
    if (openedBootstrap.current) return;
    if (bootstrapEdit) {
      openedBootstrap.current = true;
      setEditSnapshot(bootstrapEdit);
      queueMicrotask(() => {
        (document.getElementById(EDIT_DIALOG_ID) as HTMLDialogElement | null)?.showModal();
      });
      return;
    }
    if (bootstrapCreate) {
      openedBootstrap.current = true;
      setCreateStart(toDatetimeLocal(new Date(bootstrapCreate.startIso)));
      setCreateEnd(toDatetimeLocal(new Date(bootstrapCreate.endIso)));
      setCreateFormKey((key) => key + 1);
      queueMicrotask(() => {
        (document.getElementById(CREATE_DIALOG_ID) as HTMLDialogElement | null)?.showModal();
      });
    }
  }, [bootstrapCreate, bootstrapEdit]);

  const openCreateForDay = (day: number) => {
    const { start, end } = slotDefaultsForDay(year, month, day);
    setCreateStart(toDatetimeLocal(start));
    setCreateEnd(toDatetimeLocal(end));
    setCreateFormKey((key) => key + 1);
    queueMicrotask(() => {
      (document.getElementById(CREATE_DIALOG_ID) as HTMLDialogElement | null)?.showModal();
    });
  };

  const openEditById = (eventId: string) => {
    const fromMonth = monthEventsPayload.find((e) => e.id === eventId && e.canEdit);
    const fromList = listEvents.find((e) => e.id === eventId)?.edit;
    const snap = fromMonth
      ? {
          id: fromMonth.id,
          title: fromMonth.title,
          startsAt: fromMonth.startsAt,
          endsAt: fromMonth.endsAt,
          description: fromMonth.description,
          meetUrl: fromMonth.meetUrl,
          projectId: fromMonth.projectId,
          labelId: fromMonth.labelId,
          attendeeIds: fromMonth.attendeeIds,
          externalAttendeeEmails: fromMonth.externalAttendeeEmails,
        }
      : fromList;
    if (!snap) return;
    setEditSnapshot(snap);
    queueMicrotask(() => {
      (document.getElementById(EDIT_DIALOG_ID) as HTMLDialogElement | null)?.showModal();
    });
  };

  const closeCreateDialog = () => {
    (document.getElementById(CREATE_DIALOG_ID) as HTMLDialogElement | null)?.close();
  };

  const closeEditDialog = () => {
    (document.getElementById(EDIT_DIALOG_ID) as HTMLDialogElement | null)?.close();
  };

  const handleCreateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (!String(fd.get("title") ?? "").trim()) return;
    closeCreateDialog();
    startMutationTransition(() => {
      void createCalendarEventAction(fd)
        .then(() => router.refresh())
        .catch((err) => {
          console.error(err);
          window.alert(err instanceof Error ? err.message : "Error");
        });
    });
  };

  const handleUpdateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (!String(fd.get("title") ?? "").trim()) return;
    closeEditDialog();
    setEditSnapshot(null);
    startMutationTransition(() => {
      void updateCalendarEventAction(fd)
        .then(() => router.refresh())
        .catch((err) => {
          console.error(err);
          window.alert(err instanceof Error ? err.message : "Error");
        });
    });
  };

  const handleDelete = () => {
    if (!editSnapshot) return;
    if (!window.confirm(t(locale, "calendarDeleteConfirm"))) return;
    const fd = new FormData();
    fd.set("eventId", editSnapshot.id);
    closeEditDialog();
    setEditSnapshot(null);
    startMutationTransition(() => {
      void deleteCalendarEventAction(fd)
        .then(() => router.refresh())
        .catch((err) => {
          console.error(err);
          window.alert(err instanceof Error ? err.message : "Error");
        });
    });
  };

  const handleCreateLabel = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!String(fd.get("name") ?? "").trim()) return;
    e.currentTarget.reset();
    startMutationTransition(() => {
      void createCalendarLabelAction(fd)
        .then(() => router.refresh())
        .catch((err) => {
          console.error(err);
          window.alert(err instanceof Error ? err.message : "Error");
        });
    });
  };

  const handleUpdateLabel = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!String(fd.get("name") ?? "").trim()) return;
    startMutationTransition(() => {
      void updateCalendarLabelAction(fd)
        .then(() => router.refresh())
        .catch((err) => {
          console.error(err);
          window.alert(err instanceof Error ? err.message : "Error");
        });
    });
  };

  const monthHrefFromYear = (m: number) =>
    calendarHref({
      y: yearForYearView,
      m,
      view: "month",
      sourceKind: navContext.sourceKind,
      sourceId: navContext.sourceId,
      defaultProjectId: navContext.defaultProjectId || undefined,
    });

  const yearNavPrev = calendarHref({
    view: "year",
    y: yearForYearView - 1,
    sourceKind: navContext.sourceKind,
    sourceId: navContext.sourceId,
    defaultProjectId: navContext.defaultProjectId || undefined,
  });
  const yearNavNext = calendarHref({
    view: "year",
    y: yearForYearView + 1,
    sourceKind: navContext.sourceKind,
    sourceId: navContext.sourceId,
    defaultProjectId: navContext.defaultProjectId || undefined,
  });
  const now = new Date();
  const yearTodayHref = calendarHref({
    y: now.getFullYear(),
    view: "year",
    sourceKind: navContext.sourceKind,
    sourceId: navContext.sourceId,
    defaultProjectId: navContext.defaultProjectId || undefined,
  });

  const pickerPreserve = {
    sourceKind: navContext.sourceKind,
    sourceId: navContext.sourceId,
    defaultProjectId: navContext.defaultProjectId,
  };

  return (
    <>
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
          pickerPreserve={pickerPreserve}
          navigationPending={navPending}
          onNavigate={pushRoute}
          onCreateForDay={openCreateForDay}
          onOpenEditableEvent={openEditById}
          onRequestDismissCreate={() => {
            closeCreateDialog();
          }}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CalendarMonthYearPicker
              year={yearForYearView}
              month={month}
              monthTitle={yearPickerTitle}
              locale={locale}
              preserve={pickerPreserve}
            />
            <div className="flex gap-2 text-base">
              <Link
                href={yearNavPrev}
                className="rounded-[6px] border border-[hsl(var(--border))] px-3 py-1.5 font-medium hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              >
                ‹
              </Link>
              <Link
                href={yearTodayHref}
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
          <CalendarYearView year={yearForYearView} events={yearEvents} locale={locale} monthHref={monthHrefFromYear} />
        </div>
      )}

      <dialog
        id={CREATE_DIALOG_ID}
        className="app-modal-dialog z-50 max-h-[calc(100dvh-1rem)] w-[min(100vw-2rem,480px)] overflow-y-auto overscroll-contain rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0 shadow-2xl backdrop:bg-black/40"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3">
          <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">{t(locale, "calendarNewEvent")}</h3>
          <CloseDialogButton
            dialogId={CREATE_DIALOG_ID}
            className="rounded-lg px-2 py-1 text-xs text-[hsl(var(--muted))] hover:bg-black/5 dark:hover:bg-white/10"
            label={t(locale, "calendarDialogClose")}
          />
        </div>
        <form
          key={createFormKey}
          className="space-y-3 p-4"
          onSubmit={handleCreateSubmit}
        >
          <input type="hidden" name="sourceKind" value={sourceKind} />
          <input type="hidden" name="sourceId" value={sourceId} />
          <div className="space-y-1">
            <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "calendarTitle")}</label>
            <Input name="title" required className="h-9 text-sm" placeholder="1:1 / Check-in" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "calendarNotes")}</label>
            <Input name="description" className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "calendarLabel")}</label>
            <Select name="labelId" className="h-9 text-sm" defaultValue={defaultCreateLabelId}>
              {labels.map((label) => (
                <option key={label.id} value={label.id}>
                  {label.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "calendarStarts")}</label>
              <Input name="startsAt" type="datetime-local" required className="h-9 text-sm" defaultValue={createStart} key={createStart} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "calendarEnds")}</label>
              <Input name="endsAt" type="datetime-local" required className="h-9 text-sm" defaultValue={createEnd} key={createEnd} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "calendarMeetUrl")}</label>
            <Input name="meetUrl" className="h-9 text-sm" placeholder="https://…" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "calendarProjectOptional")}</label>
            <Select name="projectId" className="h-9 text-sm" defaultValue={defaultProjectId}>
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          <label className="flex items-start gap-2 rounded-lg border border-[hsl(var(--border))] p-3 text-sm text-[hsl(var(--foreground))]">
            <input name="includeProjectMembers" type="checkbox" defaultChecked className="mt-1" />
            <span>
              <span className="block font-medium">{t(locale, "calendarInviteProjectMembers")}</span>
              <span className="block text-xs leading-relaxed text-[hsl(var(--muted))]">
                {t(locale, "calendarInviteProjectMembersHint")}
              </span>
            </span>
          </label>
          <CalendarEventAttendeesFields
            staffOptions={inviteCandidates.map((u) => ({ id: u.id, name: u.name, email: u.email }))}
            organizerUserId={userId}
            labels={{
              staffTitle: t(locale, "calendarAttendees"),
              staffSearch: t(locale, "calendarAttendeesStaffSearch"),
              staffHint: t(locale, "calendarAttendeesStaffHint"),
              staffNoMatch: t(locale, "calendarAttendeesStaffNoMatch"),
              staffNoMore: t(locale, "calendarAttendeesStaffNoMore"),
              remove: t(locale, "btnRemove"),
              externalTitle: t(locale, "calendarAttendeesExternal"),
              externalHint: t(locale, "calendarAttendeesExternalHint"),
            }}
          />
          <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3">
            <button
              type="button"
              className="rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => closeCreateDialog()}
            >
              {t(locale, "calendarDialogCancel")}
            </button>
            <button
              type="submit"
              disabled={mutationPending}
              className="rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-[hsl(var(--primary-foreground))] disabled:opacity-60"
            >
              {t(locale, "calendarCreate")}
            </button>
          </div>
        </form>
      </dialog>

      {editSnapshot ? (
        <dialog
          id={EDIT_DIALOG_ID}
          className="app-modal-dialog z-50 max-h-[calc(100dvh-1rem)] w-[min(100vw-2rem,480px)] overflow-y-auto overscroll-contain rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0 shadow-2xl backdrop:bg-black/40"
          onClose={() => setEditSnapshot(null)}
        >
          <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3">
            <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">{t(locale, "calendarEditEvent")}</h3>
            <CloseDialogButton
              dialogId={EDIT_DIALOG_ID}
              className="rounded-lg px-2 py-1 text-xs text-[hsl(var(--muted))] hover:bg-black/5 dark:hover:bg-white/10"
              label={t(locale, "calendarDialogClose")}
            />
          </div>
          <form className="space-y-3 p-4" onSubmit={handleUpdateSubmit}>
            <input type="hidden" name="eventId" value={editSnapshot.id} />
            <div className="space-y-1">
              <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "calendarTitle")}</label>
              <Input name="title" required className="h-9 text-sm" defaultValue={editSnapshot.title} key={editSnapshot.id} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "calendarNotes")}</label>
              <Input name="description" className="h-9 text-sm" defaultValue={editSnapshot.description ?? ""} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "calendarLabel")}</label>
              <Select name="labelId" className="h-9 text-sm" defaultValue={editSnapshot.labelId ?? defaultMeetingLabelId}>
                {labels.map((label) => (
                  <option key={label.id} value={label.id}>
                    {label.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "calendarStarts")}</label>
                <Input
                  name="startsAt"
                  type="datetime-local"
                  required
                  className="h-9 text-sm"
                  defaultValue={toDatetimeLocal(new Date(editSnapshot.startsAt))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "calendarEnds")}</label>
                <Input
                  name="endsAt"
                  type="datetime-local"
                  required
                  className="h-9 text-sm"
                  defaultValue={toDatetimeLocal(new Date(editSnapshot.endsAt))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "calendarMeetUrl")}</label>
              <Input name="meetUrl" className="h-9 text-sm" defaultValue={editSnapshot.meetUrl ?? ""} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "calendarProjectOptional")}</label>
              <Select name="projectId" className="h-9 text-sm" defaultValue={editSnapshot.projectId ?? ""}>
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
            <label className="flex items-start gap-2 rounded-lg border border-[hsl(var(--border))] p-3 text-sm text-[hsl(var(--foreground))]">
              <input name="includeProjectMembers" type="checkbox" className="mt-1" />
              <span>
                <span className="block font-medium">{t(locale, "calendarInviteProjectMembers")}</span>
                <span className="block text-xs leading-relaxed text-[hsl(var(--muted))]">
                  {t(locale, "calendarInviteProjectMembersHint")}
                </span>
              </span>
            </label>
            <CalendarEventAttendeesFields
              key={`attendees-${editSnapshot.id}`}
              staffOptions={inviteCandidates.map((u) => ({ id: u.id, name: u.name, email: u.email }))}
              organizerUserId={userId}
              initialSelectedIds={editSnapshot.attendeeIds}
              initialExternalEmails={editSnapshot.externalAttendeeEmails}
              labels={{
                staffTitle: t(locale, "calendarAttendees"),
                staffSearch: t(locale, "calendarAttendeesStaffSearch"),
                staffHint: t(locale, "calendarAttendeesStaffHint"),
                staffNoMatch: t(locale, "calendarAttendeesStaffNoMatch"),
                staffNoMore: t(locale, "calendarAttendeesStaffNoMore"),
                remove: t(locale, "btnRemove"),
                externalTitle: t(locale, "calendarAttendeesExternal"),
                externalHint: t(locale, "calendarAttendeesExternalHint"),
              }}
            />
            <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-between gap-2 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                onClick={handleDelete}
                disabled={mutationPending}
              >
                {t(locale, "calendarDeleteEvent")}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
                  onClick={() => {
                    closeEditDialog();
                    setEditSnapshot(null);
                  }}
                >
                  {t(locale, "calendarDialogCancel")}
                </button>
                <button
                  type="submit"
                  disabled={mutationPending}
                  className="rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-[hsl(var(--primary-foreground))] disabled:opacity-60"
                >
                  {t(locale, "btnSave")}
                </button>
              </div>
            </div>
          </form>
        </dialog>
      ) : null}

      <Card className="rounded-[12px] border border-[hsl(var(--border))] p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="font-display text-base font-bold">{t(locale, "calendarLabelsTitle")}</CardTitle>
          <span className="text-sm text-[hsl(var(--muted))]">{t(locale, "calendarLabelsHint")}</span>
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          {labels.map((label) => (
            <form key={label.id} onSubmit={handleUpdateLabel} className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] p-2">
              <input type="hidden" name="labelId" value={label.id} />
              <input
                type="color"
                name="color"
                defaultValue={label.color}
                className="h-9 w-10 shrink-0 cursor-pointer rounded border border-[hsl(var(--border))] bg-transparent p-1"
                aria-label={t(locale, "calendarLabelColor")}
              />
              <Input name="name" defaultValue={label.name} className="h-9 min-w-0 text-sm" />
              <button
                type="submit"
                disabled={mutationPending}
                className="shrink-0 rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-60 dark:hover:bg-white/10"
              >
                {t(locale, "btnSave")}
              </button>
            </form>
          ))}
        </div>
        <form onSubmit={handleCreateLabel} className="mt-3 flex flex-wrap items-end gap-2 border-t border-[hsl(var(--border))] pt-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "calendarNewLabel")}</label>
            <Input name="name" className="h-9 w-48 text-sm" placeholder={t(locale, "calendarNewLabelPlaceholder")} />
          </div>
          <input
            type="color"
            name="color"
            defaultValue="#6366f1"
            className="h-9 w-10 cursor-pointer rounded border border-[hsl(var(--border))] bg-transparent p-1"
            aria-label={t(locale, "calendarLabelColor")}
          />
          <button
            type="submit"
            disabled={mutationPending}
            className="rounded-md bg-[hsl(var(--foreground))] px-3 py-2 text-sm font-semibold text-[hsl(var(--background))] disabled:opacity-60"
          >
            {t(locale, "calendarAddLabel")}
          </button>
        </form>
      </Card>

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
                  {ev.href ? (
                    <Link href={ev.href} className="font-medium text-[hsl(var(--primary))] hover:underline">
                      {ev.title}
                    </Link>
                  ) : (
                    <p className="font-medium text-[hsl(var(--foreground))]">{ev.title}</p>
                  )}
                  <p className="text-base text-[hsl(var(--muted))]">
                    {ev.startsAtIso.slice(0, 16).replace("T", " ")} → {ev.endsAtIso.slice(0, 16).replace("T", " ")}
                    {ev.organizerName ? ` · ${ev.organizerName}` : ""}
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
                  {ev.externalCount > 0 ? (
                    <p className="mt-1 text-sm text-[hsl(var(--muted))]">
                      {t(locale, "calendarExternalGuestsCount").replace("{n}", String(ev.externalCount))}
                    </p>
                  ) : null}
                  {ev.edit ? (
                    <p className="mt-2">
                      <button
                        type="button"
                        className="text-base font-semibold text-[hsl(var(--primary))] hover:underline"
                        onClick={() => openEditById(ev.id)}
                      >
                        {t(locale, "calendarEditEvent")}
                      </button>
                    </p>
                  ) : null}
                </div>
                <span
                  className="rounded-full px-2 py-1 text-base font-medium text-[hsl(var(--foreground))]"
                  style={{
                    backgroundColor: `${ev.label?.color ?? "#71717a"}1f`,
                    border: `1px solid ${ev.label?.color ?? "#71717a"}66`,
                  }}
                >
                  {ev.label?.name ?? ev.sourceKind}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
