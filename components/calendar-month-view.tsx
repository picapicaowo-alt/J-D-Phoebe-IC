import Link from "next/link";
import { CalendarMonthYearPicker } from "@/components/calendar-month-year-picker";

export type CalendarMonthEvent = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  sourceKind: string;
};

const WEEK_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEK_ZH = ["日", "一", "二", "三", "四", "五", "六"] as const;

function isSameLocalDay(a: Date, y: number, month: number, day: number) {
  return a.getFullYear() === y && a.getMonth() + 1 === month && a.getDate() === day;
}

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
  eventDetailHref,
  preserveQuery,
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
  eventDetailHref?: (eventId: string) => string;
  preserveQuery?: { create?: boolean; sourceKind?: string; sourceId?: string; eventId?: string };
}) {
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
    <div className="rounded-[12px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <CalendarMonthYearPicker
          year={year}
          month={month}
          monthTitle={monthTitle}
          locale={locale}
          preserve={{
            create: preserveQuery?.create,
            sourceKind: preserveQuery?.sourceKind,
            sourceId: preserveQuery?.sourceId,
            eventId: preserveQuery?.eventId,
          }}
        />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href={prevHref}
            aria-label={prevLabel}
            className="rounded-[6px] border border-[hsl(var(--border))] px-3 py-1.5 font-medium text-[hsl(var(--foreground))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
          >
            ‹
          </Link>
          <Link
            href={todayHref}
            className="rounded-[6px] border border-[hsl(var(--border))] px-3 py-1.5 font-medium text-[hsl(var(--foreground))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
          >
            {todayLabel}
          </Link>
          <Link
            href={nextHref}
            aria-label={nextLabel}
            className="rounded-[6px] border border-[hsl(var(--border))] px-3 py-1.5 font-medium text-[hsl(var(--foreground))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
          >
            ›
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px rounded-lg bg-[hsl(var(--border))] text-center text-sm font-semibold text-[hsl(var(--muted))]">
        {week.map((d) => (
          <div key={d} className="bg-[hsl(var(--card))] py-2.5">
            {d}
          </div>
        ))}
      </div>
      <div className="mt-px grid grid-cols-7 gap-px rounded-lg bg-[hsl(var(--border))]">
        {cells.map((day, idx) => {
          const isToday = !!(day && isSameLocalDay(today, year, month, day));
          return (
            <div
              key={idx}
              className={`min-h-[104px] bg-[hsl(var(--card))] p-1.5 text-left align-top ${
                isToday ? "ring-2 ring-inset ring-[hsl(var(--primary))]/50" : ""
              }`}
            >
              {day ? (
                <div className="mb-1 flex items-center justify-between gap-1">
                  <span
                    className={`inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full text-xs font-semibold ${
                      isToday ? "bg-[hsl(var(--primary))] text-white" : "text-[hsl(var(--foreground))]"
                    }`}
                  >
                    {day}
                  </span>
                </div>
              ) : null}
              <ul className="space-y-1">
                {(day ? byDay.get(day) ?? [] : []).slice(0, 5).map((ev) => {
                  const href = eventDetailHref?.(ev.id);
                  const cls =
                    "block truncate rounded-md bg-[hsl(var(--primary))]/12 px-1.5 py-1 text-xs font-medium leading-snug text-[hsl(var(--foreground))] hover:bg-[hsl(var(--primary))]/20";
                  return (
                    <li key={ev.id}>
                      {href ? (
                        <Link href={href} className={cls} title={ev.title}>
                          {ev.title}
                        </Link>
                      ) : (
                        <span className={cls} title={ev.title}>
                          {ev.title}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {(() => {
                if (!day) return null;
                const n = byDay.get(day)?.length ?? 0;
                return n > 5 ? <p className="mt-1 text-xs font-medium text-[hsl(var(--muted))]">+{n - 5}</p> : null;
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
