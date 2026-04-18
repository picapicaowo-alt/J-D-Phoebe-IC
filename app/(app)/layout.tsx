import { ReactNode, Suspense } from "react";
import Link from "next/link";
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
          <div className="flex justify-center pb-5">
            <BrandMark />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
            <Link href="/home" className="font-display text-xl font-semibold tracking-[-0.02em] text-zinc-900 dark:text-zinc-50 sm:text-2xl">
              Internal Management
            </Link>
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
