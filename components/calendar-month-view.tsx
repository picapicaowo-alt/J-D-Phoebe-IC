"use client";

import Link from "next/link";
import { useCallback } from "react";
import { CalendarMonthYearPicker } from "@/components/calendar-month-year-picker";

export type CalendarMonthEvent = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  sourceKind: string;
  canEdit: boolean;
  href?: string | null;
  label?: { name: string; color: string } | null;
};

export type CalendarMonthPickerPreserve = {
  sourceKind?: string;
  sourceId?: string;
  defaultProjectId?: string;
};

const WEEK_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEK_ZH = ["日", "一", "二", "三", "四", "五", "六"] as const;

function isSameLocalDay(a: Date, y: number, month: number, day: number) {
  return a.getFullYear() === y && a.getMonth() + 1 === month && a.getDate() === day;
}

const navBtnClass =
  "rounded-[6px] border border-[hsl(var(--border))] px-3 py-1.5 font-medium text-[hsl(var(--foreground))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] disabled:pointer-events-none disabled:opacity-50";

export function CalendarMonthView({
  year,
  month,
  monthTitle,
  events,
  locale,
  prevHref,
  nextHref,
  todayHref,
  prevLabel,
  nextLabel,
  todayLabel,
  pickerPreserve,
  navigationPending,
  onNavigate,
  onCreateForDay,
  onOpenEditableEvent,
  onRequestDismissCreate,
}: {
  year: number;
  month: number;
  monthTitle: string;
  events: CalendarMonthEvent[];
  locale: "en" | "zh";
  prevHref: string;
  nextHref: string;
  todayHref: string;
  prevLabel: string;
  nextLabel: string;
  todayLabel: string;
  pickerPreserve?: CalendarMonthPickerPreserve;
  navigationPending: boolean;
  onNavigate: (href: string) => void;
  onCreateForDay: (day: number) => void;
  onOpenEditableEvent: (eventId: string) => void;
  onRequestDismissCreate?: () => void;
}) {
  const pushRoute = useCallback((href: string) => onNavigate(href), [onNavigate]);

  const navBusy = navigationPending;

  const first = new Date(year, month - 1, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
  const cells: (number | null)[] = [];
  for (let i = 0; i < totalCells; i++) {
    const day = i - startWeekday + 1;
    cells.push(day >= 1 && day <= daysInMonth ? day : null);
  }

  const byDay = new Map<number, CalendarMonthEvent[]>();
  for (const ev of events) {
    const d = new Date(ev.startsAt);
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue;
    const dom = d.getDate();
    if (!byDay.has(dom)) byDay.set(dom, []);
    byDay.get(dom)!.push(ev);
  }

  const week = locale === "zh" ? WEEK_ZH : WEEK_EN;
  const today = new Date();

  return (
    <div className="relative rounded-[12px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm">
      {navBusy ? (
        <div
          className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 rounded-[12px] bg-[hsl(var(--card))]/70 backdrop-blur-[2px]"
          aria-busy="true"
          aria-live="polite"
        >
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent"
            role="status"
            aria-label={locale === "zh" ? "正在更新" : "Loading"}
          />
        </div>
      ) : null}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <CalendarMonthYearPicker
          year={year}
          month={month}
          monthTitle={monthTitle}
          locale={locale}
          preserve={pickerPreserve ?? {}}
          pushRoute={pushRoute}
        />
        <div className="flex flex-wrap items-center gap-2 text-base">
          <button type="button" disabled={navBusy} onClick={() => pushRoute(prevHref)} aria-label={prevLabel} className={navBtnClass}>
            ‹
          </button>
          <button type="button" disabled={navBusy} onClick={() => pushRoute(todayHref)} className={navBtnClass}>
            {todayLabel}
          </button>
          <button type="button" disabled={navBusy} onClick={() => pushRoute(nextHref)} aria-label={nextLabel} className={navBtnClass}>
            ›
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px rounded-lg bg-[hsl(var(--border))] text-center text-base font-semibold text-[hsl(var(--muted))]">
        {week.map((d) => (
          <div key={d} className="bg-[hsl(var(--card))] py-2.5">
            {d}
          </div>
        ))}
      </div>
      <div
        className="mt-px grid grid-cols-7 gap-px rounded-lg bg-[hsl(var(--border))]"
        onContextMenuCapture={(e) => {
          if (!onRequestDismissCreate) return;
          e.preventDefault();
          onRequestDismissCreate();
        }}
      >
        {cells.map((day, idx) => {
          const isToday = !!(day && isSameLocalDay(today, year, month, day));
          return (
            <div
              key={idx}
              className={`relative min-h-[104px] bg-[hsl(var(--card))] p-1.5 text-left align-top ${
                isToday ? "ring-2 ring-inset ring-[hsl(var(--primary))]/50" : ""
              }`}
            >
              {day ? (
                <>
                  <button
                    type="button"
                    disabled={navBusy}
                    onClick={() => onCreateForDay(day)}
                    className="absolute inset-0 z-0 rounded-sm hover:bg-black/[0.03] disabled:cursor-wait dark:hover:bg-white/[0.04]"
                    aria-label={locale === "zh" ? `在 ${month} 月 ${day} 日添加日程` : `Add event on ${month}/${day}`}
                  />
                  <div className="pointer-events-none relative z-[1] mb-1 flex items-center justify-between gap-1">
                    <span
                      className={`inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full text-sm font-semibold ${
                        isToday ? "bg-[hsl(var(--primary))] text-white" : "text-[hsl(var(--foreground))]"
                      }`}
                    >
                      {day}
                    </span>
                  </div>
                  <ul className="relative z-[2] space-y-1 pointer-events-none">
                    {(byDay.get(day) ?? []).slice(0, 5).map((ev) => {
                      const color = ev.label?.color ?? "#6366f1";
                      const cls =
                        "block w-full truncate rounded-md border-l-4 px-1.5 py-1 text-left text-sm font-medium leading-snug text-[hsl(var(--foreground))] hover:brightness-95 disabled:opacity-60";
                      const style = { borderLeftColor: color, backgroundColor: `${color}1f` };
                      return (
                        <li key={ev.id} className="pointer-events-auto">
                          {ev.canEdit ? (
                            <button
                              type="button"
                              disabled={navBusy}
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenEditableEvent(ev.id);
                              }}
                              className={cls}
                              style={style}
                              title={ev.title}
                            >
                              {ev.title}
                            </button>
                          ) : ev.href ? (
                            <Link href={ev.href} className={cls} style={style} title={ev.title}>
                              {ev.title}
                            </Link>
                          ) : (
                            <span className={cls} style={style} title={ev.title}>
                              {ev.title}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {(() => {
                    const n = byDay.get(day)?.length ?? 0;
                    return n > 5 ? <p className="relative z-[2] mt-1 text-sm font-medium text-[hsl(var(--muted))]">+{n - 5}</p> : null;
                  })()}
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
