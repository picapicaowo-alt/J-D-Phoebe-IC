import Link from "next/link";
import { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { isClerkEnabled } from "@/lib/clerk-config";
import { getPermissionKeysForUser } from "@/lib/permissions";
import { SignOutControl } from "@/components/sign-out-control";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { AppShellNav, type ShellNavDropdown, type ShellNavLink } from "@/components/app-shell-nav";
import { BrandMark } from "@/components/brand-mark";
import { LocaleToggleHeader } from "@/components/locale-toggle-header";
import { UserFace } from "@/components/user-face";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const keys = user ? await getPermissionKeysForUser(user.id, user.isSuperAdmin) : null;
  const locale = await getLocale();

  const primaryLinks: ShellNavLink[] = [];
  if (keys?.has("project.read")) {
    primaryLinks.push({ href: "/home", label: t(locale, "navHome") });
    primaryLinks.push({ href: "/projects", label: t(locale, "navProjects") });
    primaryLinks.push({ href: "/calendar", label: t(locale, "navCalendar") });
  }
  if (keys?.has("knowledge.read")) primaryLinks.push({ href: "/knowledge", label: t(locale, "navKnowledge") });
  if (keys?.has("staff.read")) primaryLinks.push({ href: "/staff", label: t(locale, "navStaff") });

  const dropdowns: ShellNavDropdown[] = [];

  const orgItems: ShellNavLink[] = [];
  if (keys?.has("org.group.read")) orgItems.push({ href: "/group", label: t(locale, "navGroup"), description: t(locale, "navDdGroupDesc") });
  if (keys?.has("company.read")) orgItems.push({ href: "/companies", label: t(locale, "navCompanies"), description: t(locale, "navDdCompaniesDesc") });
  if (orgItems.length) dropdowns.push({ id: "org", label: t(locale, "navDropdownOrg"), items: orgItems });

  const moreItems: ShellNavLink[] = [];
  if (keys?.has("leaderboard.read")) moreItems.push({ href: "/leaderboard", label: t(locale, "navLeaderboards"), description: t(locale, "navDdLeaderboardsDesc") });
  if (keys?.has("lifecycle.onboarding.hub")) moreItems.push({ href: "/onboarding", label: t(locale, "navOnboarding"), description: t(locale, "navDdOnboardingDesc") });
  if (user && (user.isSuperAdmin || user.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN"))) {
    moreItems.push({ href: "/settings/lifecycle", label: t(locale, "navLifecycle"), description: t(locale, "navDdLifecycleDesc") });
  }
  if (moreItems.length) dropdowns.push({ id: "more", label: t(locale, "navDropdownMore"), items: moreItems });

  const systemItems: ShellNavLink[] = [];
  if (user) {
    systemItems.push({ href: "/settings/profile", label: t(locale, "navMyProfile"), description: t(locale, "navDdProfileDesc") });
  }
  if (keys?.has("role.display_name.update")) systemItems.push({ href: "/settings/roles", label: t(locale, "navRoles"), description: t(locale, "navDdRolesDesc") });
  if (keys?.has("permission.matrix.read")) systemItems.push({ href: "/settings/permissions", label: t(locale, "navPermissions"), description: t(locale, "navDdPermissionsDesc") });
  if (keys?.has("project.read")) systemItems.push({ href: "/settings/integrations", label: t(locale, "integrationsNav"), description: t(locale, "navDdIntegrationsDesc") });
  if (keys?.has("trash.read")) systemItems.push({ href: "/trash", label: t(locale, "navTrash"), description: t(locale, "navDdTrashDesc") });
  if (systemItems.length) dropdowns.push({ id: "system", label: t(locale, "navDropdownSystem"), items: systemItems });

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
          {user && (primaryLinks.length > 0 || dropdowns.length > 0) ? (
            <div className="border-t border-[hsl(var(--border))] pt-2">
              <AppShellNav primaryLinks={primaryLinks} dropdowns={dropdowns} />
            </div>
          ) : null}
        </div>
      </header>
      <div className="mx-auto max-w-container px-5 py-8 sm:px-6">{children}</div>
    </div>
  );
}
