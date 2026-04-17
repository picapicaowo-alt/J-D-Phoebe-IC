import Link from "next/link";
import { getZonedDateParts } from "@/lib/timezone";

export type CalendarYearEvent = { id: string; title: string; startsAt: Date; label?: { name: string; color: string } | null };

export function CalendarYearView({
  year,
  events,
  locale,
  timeZone,
  monthHref,
}: {
  year: number;
  events: CalendarYearEvent[];
  locale: "en" | "zh";
  timeZone: string;
  monthHref: (month: number) => string;
}) {
  const byMonth = new Map<number, CalendarYearEvent[]>();
  for (let m = 1; m <= 12; m++) byMonth.set(m, []);
  for (const ev of events) {
    const parts = getZonedDateParts(ev.startsAt, timeZone);
    if (!parts || parts.year !== year) continue;
    byMonth.get(parts.month)!.push(ev);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        const label = new Date(year, month - 1).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "long" });
        const rows = byMonth.get(month) ?? [];
        return (
          <div key={month} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 shadow-sm">
            <Link href={monthHref(month)} className="font-display text-sm font-bold text-[hsl(var(--primary))] hover:underline">
              {label}
            </Link>
            <ul className="mt-2 space-y-1.5 text-sm leading-snug text-[hsl(var(--foreground))]">
              {rows.slice(0, 12).map((ev) => (
                <li key={ev.id} className="flex min-w-0 items-center gap-1.5 truncate" title={ev.title}>
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: ev.label?.color ?? "#71717a" }}
                    aria-hidden
                  />
                  <span className="truncate">{ev.title}</span>
                </li>
              ))}
            </ul>
            {rows.length > 12 ? <p className="mt-2 text-sm text-[hsl(var(--muted))]">+{rows.length - 12}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
