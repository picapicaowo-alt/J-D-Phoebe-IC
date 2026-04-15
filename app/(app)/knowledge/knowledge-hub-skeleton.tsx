export function KnowledgeHubSkeleton() {
  return (
    <div className="animate-pulse space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-10 w-10 shrink-0 rounded-xl bg-[hsl(var(--border))]/80" />
          <div className="space-y-2">
            <div className="h-7 w-48 max-w-full rounded-md bg-[hsl(var(--border))]/90" />
            <div className="h-4 w-full max-w-xl rounded-md bg-[hsl(var(--border))]/70" />
          </div>
        </div>
        <div className="h-10 w-32 rounded-[10px] bg-[hsl(var(--border))]/70" />
      </div>
      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10 p-4">
        <div className="h-11 w-full rounded-[10px] bg-[hsl(var(--border))]/60" />
      </div>
      <div className="space-y-3">
        <div className="h-3 w-40 rounded bg-[hsl(var(--border))]/70" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-52 rounded-xl border border-[hsl(var(--border))]/80 bg-[hsl(var(--card))]" />
          <div className="h-52 rounded-xl border border-[hsl(var(--border))]/80 bg-[hsl(var(--card))]" />
          <div className="h-52 rounded-xl border border-[hsl(var(--border))]/80 bg-[hsl(var(--card))]" />
          <div className="h-52 rounded-xl border border-[hsl(var(--border))]/80 bg-[hsl(var(--card))]" />
        </div>
      </div>
      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm">
        <div className="h-4 w-32 rounded bg-[hsl(var(--border))]/80" />
        <div className="mt-4 space-y-3">
          <div className="h-16 w-full rounded-lg bg-[hsl(var(--border))]/50" />
          <div className="h-16 w-full rounded-lg bg-[hsl(var(--border))]/50" />
          <div className="h-16 w-full rounded-lg bg-[hsl(var(--border))]/50" />
        </div>
      </div>
    </div>
  );
}
