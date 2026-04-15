"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

function buildMonthUrl(
  y: number,
  m: number,
  preserve: { sourceKind?: string; sourceId?: string; defaultProjectId?: string },
) {
  const p = new URLSearchParams();
  p.set("y", String(y));
  p.set("m", String(m));
  p.set("view", "month");
  if (preserve.sourceId) {
    p.set("sourceKind", preserve.sourceKind || "MANUAL");
    p.set("sourceId", preserve.sourceId);
  }
  if (preserve.defaultProjectId) p.set("defaultProjectId", preserve.defaultProjectId);
  return `/calendar?${p.toString()}`;
}

export function CalendarMonthYearPicker({
  year,
  month,
  monthTitle,
  locale,
  preserve,
  pushRoute,
}: {
  year: number;
  month: number;
  monthTitle: string;
  locale: "en" | "zh";
  preserve: { sourceKind?: string; sourceId?: string; defaultProjectId?: string };
  /** When set (e.g. wrapped in `startTransition`), keeps the calendar responsive during App Router navigations. */
  pushRoute?: (href: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(year);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setPickerYear(year);
  }, [year, month, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = useCallback(
    (y: number, m: number) => {
      const href = buildMonthUrl(y, m, preserve);
      if (pushRoute) pushRoute(href);
      else router.push(href);
      setOpen(false);
    },
    [router, preserve, pushRoute],
  );

  const monthLabel = (mm: number) =>
    new Date(2000, mm - 1, 1).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "short" });

  return (
    <div ref={rootRef} className="relative inline-flex min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-full items-center gap-2 rounded-lg px-2 py-1 text-left font-display text-lg font-bold tracking-tight text-[hsl(var(--foreground))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] md:text-xl"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[hsl(var(--border))] text-[hsl(var(--muted))]" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="3.5" y="5" width="17" height="15" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M3 10h18" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="8" cy="7.5" r="0.75" fill="currentColor" />
            <circle cx="12" cy="7.5" r="0.75" fill="currentColor" />
          </svg>
        </span>
        <span className="truncate">{monthTitle}</span>
        <span className={cn("shrink-0 text-sm text-[hsl(var(--muted))] transition-transform", open && "rotate-180")} aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div
          className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-[min(calc(100vw-2rem),18.5rem)] rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl"
          role="dialog"
          aria-label="Select month"
        >
          <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-3 py-2.5">
            <button
              type="button"
              className="rounded-lg px-2 py-1.5 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
              onClick={() => setPickerYear((y) => y - 1)}
              aria-label="Previous year"
            >
              ‹
            </button>
            <span className="text-base font-semibold tabular-nums text-[hsl(var(--foreground))]">{pickerYear}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded-lg p-1.5 text-[hsl(var(--muted))] hover:bg-black/[0.05] hover:text-[hsl(var(--foreground))] dark:hover:bg-white/[0.06]"
                onClick={() => setPickerYear(new Date().getFullYear())}
                title="This year"
                aria-label="This year"
              >
                <span className="inline-block h-2 w-2 rounded-full bg-[hsl(var(--primary))]" />
              </button>
              <button
                type="button"
                className="rounded-lg px-2 py-1.5 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
                onClick={() => setPickerYear((y) => y + 1)}
                aria-label="Next year"
              >
                ›
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1 p-2">
            {Array.from({ length: 12 }, (_, i) => {
              const mm = i + 1;
              const active = mm === month && pickerYear === year;
              return (
                <button
                  key={mm}
                  type="button"
                  onClick={() => go(pickerYear, mm)}
                  className={cn(
                    "rounded-lg px-2 py-2.5 text-base font-medium transition-colors",
                    active
                      ? "bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]/30"
                      : "text-[hsl(var(--foreground))] hover:bg-black/[0.05] dark:hover:bg-white/[0.06]",
                  )}
                >
                  {locale === "zh" ? `${mm}月` : monthLabel(mm)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
