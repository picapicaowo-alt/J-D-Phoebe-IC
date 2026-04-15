import Link from "next/link";
import { ReactNode, Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { isClerkEnabled } from "@/lib/clerk-config";
import { SignOutControl } from "@/components/sign-out-control";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { BrandMark } from "@/components/brand-mark";
import { LocaleToggleHeader } from "@/components/locale-toggle-header";
import { UserFace } from "@/components/user-face";
import { AppShellPrimaryNav } from "@/components/app-shell-primary-nav";
import { AppShellNavSkeleton } from "@/components/app-shell-nav-skeleton";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const locale = await getLocale();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-container flex-col gap-3 px-5 py-3 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <BrandMark />
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2 text-base text-[hsl(var(--muted))]">
              {user ? (
                <>
                  <LocaleToggleHeader locale={locale} />
                  <div className="hidden h-4 w-px bg-[hsl(var(--border))] sm:block" aria-hidden />
                  <Link
                    href="/settings/profile"
                    className="flex max-w-[16rem] items-center gap-2 rounded-lg py-1 pl-1 pr-2 text-left outline-none ring-offset-2 hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] dark:hover:bg-white/[0.06]"
                  >
                    <UserFace name={user.name} avatarUrl={user.avatarUrl} size={28} />
                    <span className="min-w-0 flex-1 truncate font-medium text-[hsl(var(--foreground))]">
                      {user.name}
                      {user.isSuperAdmin ? ` · ${t(locale, "superAdminBadge")}` : ""}
                    </span>
                  </Link>
                  <SignOutControl clerkEnabled={isClerkEnabled()} />
                </>
              ) : (
                <Link className="font-medium text-[hsl(var(--primary))] underline-offset-4 hover:underline" href={isClerkEnabled() ? "/sign-in" : "/login"}>
                  {t(locale, "signIn")}
                </Link>
              )}
            </div>
          </div>
          {user ? (
            <Suspense fallback={<AppShellNavSkeleton />}>
              <AppShellPrimaryNav />
            </Suspense>
          ) : null}
        </div>
      </header>
      <div className="mx-auto max-w-container px-5 py-8 sm:px-6">{children}</div>
    </div>
  );
}
