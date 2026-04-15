import { Card } from "@/components/ui/card";

/** Generic card-shaped skeleton for section-level Suspense boundaries. */
export function CardSkeleton({ className = "" }: { className?: string }) {
  return (
    <Card className={`animate-pulse border-zinc-200/90 p-5 dark:border-zinc-800 ${className}`}>
      <div className="space-y-3">
        <div className="h-5 w-44 rounded-md bg-zinc-200/90 dark:bg-zinc-700/80" />
        <div className="h-4 max-w-md rounded-md bg-zinc-200/70 dark:bg-zinc-700/60" />
        <div className="h-24 rounded-lg bg-zinc-200/60 dark:bg-zinc-700/50" />
      </div>
    </Card>
  );
}

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

export function HomeSnapshotFallback() {
  return <CardSkeleton />;
}

export function HomePrioritiesFallback() {
  return <CardSkeleton className="min-h-[24rem] lg:col-span-2" />;
}

export function HomeExecutionSnapshotFallback() {
  return <CardSkeleton className="min-h-[16rem]" />;
}

export function HomeGoodThingsFallback() {
  return <CardSkeleton className="min-h-[14rem]" />;
}

export function HomeScoreFallback() {
  return <CardSkeleton className="min-h-[13rem] lg:col-span-3" />;
}
