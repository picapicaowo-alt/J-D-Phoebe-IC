import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "good" | "warn" | "bad" | "info" | "violet" }) {
  const tones = {
    neutral: "bg-black/5 text-[hsl(var(--foreground))] dark:bg-white/10",
    good: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
    warn: "bg-amber-500/15 text-amber-900 dark:text-amber-100",
    bad: "bg-rose-500/15 text-rose-900 dark:text-rose-100",
    info: "bg-blue-500/15 text-blue-900 dark:text-blue-100",
    violet: "bg-violet-500/15 text-violet-900 dark:text-violet-200",
  } as const;

  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}
