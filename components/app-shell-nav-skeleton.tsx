export function AppShellNavSkeleton() {
  return (
    <div className="border-t border-[hsl(var(--border))] pt-2">
      <div className="flex flex-wrap gap-2">
        <div className="h-9 w-20 animate-pulse rounded-lg bg-[hsl(var(--border))]/80" />
        <div className="h-9 w-24 animate-pulse rounded-lg bg-[hsl(var(--border))]/80" />
        <div className="h-9 w-28 animate-pulse rounded-lg bg-[hsl(var(--border))]/80" />
        <div className="h-9 w-32 animate-pulse rounded-lg bg-[hsl(var(--border))]/60" />
      </div>
    </div>
  );
}
