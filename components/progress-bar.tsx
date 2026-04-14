import { cn } from "@/lib/utils";

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10", className)}>
      <div className="h-full rounded-full bg-[hsl(var(--accent))]" style={{ width: `${v}%` }} />
    </div>
  );
}
