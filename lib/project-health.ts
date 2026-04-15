import type { ProjectStatus } from "@prisma/client";

/** Stored project completion (0–100), clamped for display. */
export function clampProjectProgressPercent(stored: number | null | undefined): number {
  const n = typeof stored === "number" && Number.isFinite(stored) ? stored : 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function projectStatusVisualClasses(status: ProjectStatus): {
  pill: string;
  bar: string;
} {
  switch (status) {
    case "ACTIVE":
      return {
        pill: "bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/30 dark:text-emerald-200",
        bar: "bg-emerald-500",
      };
    case "PLANNING":
      return {
        pill: "bg-amber-500/15 text-amber-900 ring-1 ring-amber-500/30 dark:text-amber-100",
        bar: "bg-amber-400",
      };
    case "AT_RISK":
      return {
        pill: "bg-orange-500/20 text-orange-950 ring-1 ring-orange-500/40 dark:text-orange-100",
        bar: "bg-orange-500",
      };
    case "ON_HOLD":
      return {
        pill: "bg-slate-400/20 text-slate-800 ring-1 ring-slate-400/40 dark:text-slate-200",
        bar: "bg-slate-400",
      };
    case "COMPLETED":
      return {
        pill: "bg-sky-500/15 text-sky-950 ring-1 ring-sky-500/35 dark:text-sky-100",
        bar: "bg-sky-500",
      };
    case "ARCHIVED":
    case "CANCELLED":
      return {
        pill: "bg-zinc-500/15 text-zinc-800 ring-1 ring-zinc-500/25 dark:text-zinc-200",
        bar: "bg-zinc-400",
      };
    default:
      return {
        pill: "bg-slate-500/15 text-slate-800 ring-1 ring-slate-500/25 dark:text-slate-200",
        bar: "bg-slate-400",
      };
  }
}
