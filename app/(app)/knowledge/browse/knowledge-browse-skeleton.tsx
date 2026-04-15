export function KnowledgeBrowseSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-32 rounded bg-[hsl(var(--border))]/80" />
          <div className="h-8 w-64 max-w-full rounded-md bg-[hsl(var(--border))]/90" />
          <div className="h-4 w-full max-w-lg rounded-md bg-[hsl(var(--border))]/70" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 rounded-[10px] bg-[hsl(var(--border))]/70" />
          <div className="h-9 w-24 rounded-md bg-[hsl(var(--border))]/60" />
        </div>
      </div>
      <div className="h-24 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10" />
      <div className="space-y-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        <div className="h-4 w-40 rounded bg-[hsl(var(--border))]/80" />
        <div className="h-32 w-full rounded-lg bg-[hsl(var(--border))]/50" />
        <div className="h-32 w-full rounded-lg bg-[hsl(var(--border))]/50" />
      </div>
    </div>
  );
}
