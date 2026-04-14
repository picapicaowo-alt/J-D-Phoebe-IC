import Link from "next/link";
import { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { isClerkEnabled } from "@/lib/clerk-config";
import { getPermissionKeysForUser } from "@/lib/permissions";
import { SignOutControl } from "@/components/sign-out-control";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const keys = user ? await getPermissionKeysForUser(user.id, user.isSuperAdmin) : null;
  const locale = await getLocale();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/home" className="text-sm font-semibold tracking-tight">
              {t(locale, "brand")}
            </Link>
            {user ? (
              <nav className="flex flex-wrap items-center gap-3 text-sm text-[hsl(var(--muted))]">
                {keys?.has("project.read") ? (
                  <Link className="hover:text-[hsl(var(--foreground))]" href="/home">
                    {t(locale, "navHome")}
                  </Link>
                ) : null}
                {keys?.has("org.group.read") ? (
                  <Link className="hover:text-[hsl(var(--foreground))]" href="/group">
                    {t(locale, "navGroup")}
                  </Link>
                ) : null}
                {keys?.has("company.read") ? (
                  <Link className="hover:text-[hsl(var(--foreground))]" href="/companies">
                    {t(locale, "navCompanies")}
                  </Link>
                ) : null}
                {keys?.has("project.read") ? (
                  <Link className="hover:text-[hsl(var(--foreground))]" href="/projects">
                    {t(locale, "navProjects")}
                  </Link>
                ) : null}
                {keys?.has("knowledge.read") ? (
                  <Link className="hover:text-[hsl(var(--foreground))]" href="/knowledge">
                    {t(locale, "navKnowledge")}
                  </Link>
                ) : null}
                {keys?.has("staff.read") ? (
                  <Link className="hover:text-[hsl(var(--foreground))]" href="/staff">
                    {t(locale, "navStaff")}
                  </Link>
                ) : null}
                {keys?.has("role.display_name.update") ? (
                  <Link className="hover:text-[hsl(var(--foreground))]" href="/settings/roles">
                    {t(locale, "navRoles")}
                  </Link>
                ) : null}
                {keys?.has("permission.matrix.read") ? (
                  <Link className="hover:text-[hsl(var(--foreground))]" href="/settings/permissions">
                    {t(locale, "navPermissions")}
                  </Link>
                ) : null}
                {keys?.has("trash.read") ? (
                  <Link className="hover:text-[hsl(var(--foreground))]" href="/trash">
                    {t(locale, "navTrash")}
                  </Link>
                ) : null}
                {keys?.has("leaderboard.read") ? (
                  <Link className="hover:text-[hsl(var(--foreground))]" href="/leaderboard">
                    {t(locale, "navLeaderboards")}
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-[hsl(var(--muted))]">
            {user ? (
              <>
                <span>
                  {user.name}
                  {user.isSuperAdmin ? ` · ${t(locale, "superAdminBadge")}` : ""}
                </span>
                <SignOutControl clerkEnabled={isClerkEnabled()} />
              </>
            ) : (
              <Link className="font-medium text-[hsl(var(--accent))]" href={isClerkEnabled() ? "/sign-in" : "/login"}>
                {t(locale, "signIn")}
              </Link>
            )}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}
