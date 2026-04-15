export default function AppSegmentLoading() {
  return (
    <div className="mx-auto max-w-container px-5 py-12 sm:px-6">
      <div className="animate-pulse space-y-4">
        <div className="h-9 w-56 max-w-full rounded-lg bg-[hsl(var(--border))]" />
        <div className="h-4 max-w-xl rounded-md bg-[hsl(var(--border))]/80" />
        <div className="h-56 max-w-4xl rounded-xl bg-[hsl(var(--border))]/60" />
      </div>
    </div>
  );
}
