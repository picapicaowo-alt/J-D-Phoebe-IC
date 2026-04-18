import { ReactNode, Suspense } from "react";
import { getLocale } from "@/lib/locale";
import { BrandMark } from "@/components/brand-mark";
import { AppShellPrimaryNav } from "@/components/app-shell-primary-nav";
import { AppShellNavSkeleton } from "@/components/app-shell-nav-skeleton";
import { AppShellHeaderControls } from "@/components/app-shell-header-controls";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-container flex-col px-5 py-3 sm:px-6">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-4 pb-5">
            <div aria-hidden />
            <div className="justify-self-center">
              <BrandMark />
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2 text-base text-[hsl(var(--muted))]">
              <Suspense fallback={<div className="h-8 w-40 animate-pulse rounded-full bg-[hsl(var(--muted))]/25" />}>
                <AppShellHeaderControls locale={locale} />
              </Suspense>
            </div>
          </div>
          <div className="pt-4">
            <Suspense fallback={<AppShellNavSkeleton />}>
              <AppShellPrimaryNav locale={locale} />
            </Suspense>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-container px-5 py-8 sm:px-6">{children}</div>
    </div>
  );
}
