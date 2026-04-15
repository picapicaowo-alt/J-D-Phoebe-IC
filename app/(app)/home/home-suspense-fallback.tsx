import { Card } from "@/components/ui/card";

export function HomeAlertsFallback() {
  return (
    <Card className="border-zinc-200/90 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
      <div className="animate-pulse space-y-3">
        <div className="h-5 w-40 rounded-md bg-zinc-200/90 dark:bg-zinc-700/80" />
        <div className="h-4 max-w-md rounded-md bg-zinc-200/70 dark:bg-zinc-700/60" />
        <div className="h-10 w-36 rounded-lg bg-zinc-200/80 dark:bg-zinc-700/70" />
      </div>
    </Card>
  );
}

export function HomeDashboardFallback() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="h-48 rounded-xl border border-zinc-200/80 bg-zinc-100/50 dark:border-zinc-800 dark:bg-zinc-900/40" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-96 rounded-xl border border-zinc-200/80 bg-zinc-100/50 lg:col-span-2 dark:border-zinc-800 dark:bg-zinc-900/40" />
        <div className="flex flex-col gap-4">
          <div className="h-64 rounded-xl border border-zinc-200/80 bg-zinc-100/50 dark:border-zinc-800 dark:bg-zinc-900/40" />
          <div className="h-56 rounded-xl border border-zinc-200/80 bg-zinc-100/50 dark:border-zinc-800 dark:bg-zinc-900/40" />
        </div>
        <div className="h-52 rounded-xl border border-zinc-200/80 bg-zinc-100/50 lg:col-span-3 dark:border-zinc-800 dark:bg-zinc-900/40" />
      </div>
    </div>
  );
}
