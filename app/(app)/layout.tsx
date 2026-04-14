import Link from "next/link";
import { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { isClerkEnabled } from "@/lib/clerk-config";
import { getPermissionKeysForUser } from "@/lib/permissions";
import { SignOutControl } from "@/components/sign-out-control";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { AppNav, type AppNavItem } from "@/components/app-nav";
import { LocaleToggleHeader } from "@/components/locale-toggle-header";
import { UserFace } from "@/components/user-face";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const keys = user ? await getPermissionKeysForUser(user.id, user.isSuperAdmin) : null;
  const locale = await getLocale();

  const navItems: AppNavItem[] = [];
  if (keys?.has("project.read")) navItems.push({ href: "/home", label: t(locale, "navHome") });
  if (keys?.has("org.group.read")) navItems.push({ href: "/group", label: t(locale, "navGroup") });
  if (keys?.has("company.read")) navItems.push({ href: "/companies", label: t(locale, "navCompanies") });
  if (keys?.has("project.read")) navItems.push({ href: "/projects", label: t(locale, "navProjects") });
  if (keys?.has("knowledge.read")) navItems.push({ href: "/knowledge", label: t(locale, "navKnowledge") });
  if (keys?.has("staff.read")) navItems.push({ href: "/staff", label: t(locale, "navStaff") });
  if (keys?.has("role.display_name.update")) navItems.push({ href: "/settings/roles", label: t(locale, "navRoles") });
  if (keys?.has("permission.matrix.read")) navItems.push({ href: "/settings/permissions", label: t(locale, "navPermissions") });
  if (keys?.has("trash.read")) navItems.push({ href: "/trash", label: t(locale, "navTrash") });
  if (keys?.has("leaderboard.read")) navItems.push({ href: "/leaderboard", label: t(locale, "navLeaderboards") });

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-zinc-200/80 bg-[hsl(var(--card))]/90 backdrop-blur-md dark:border-[hsl(var(--border))] dark:bg-[hsl(var(--card))]/80">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 sm:gap-5">
            <Link
              href="/home"
              className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold tracking-tight text-white shadow-sm dark:bg-white dark:text-zinc-900"
            >
              {t(locale, "brandNav")}
            </Link>
            {user && navItems.length ? <AppNav items={navItems} /> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            {user ? (
              <>
                <LocaleToggleHeader locale={locale} />
                <div className="hidden h-4 w-px bg-zinc-200 sm:block dark:bg-zinc-700" aria-hidden />
                <div className="flex items-center gap-2">
                  <UserFace name={user.name} avatarUrl={user.avatarUrl} size={28} />
                  <span className="max-w-[10rem] truncate font-medium text-zinc-800 dark:text-zinc-200">
                    {user.name}
                    {user.isSuperAdmin ? ` · ${t(locale, "superAdminBadge")}` : ""}
                  </span>
                </div>
                <SignOutControl clerkEnabled={isClerkEnabled()} />
              </>
            ) : (
              <Link className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-white" href={isClerkEnabled() ? "/sign-in" : "/login"}>
                {t(locale, "signIn")}
              </Link>
            )}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6">{children}</div>
    </div>
  );
}
