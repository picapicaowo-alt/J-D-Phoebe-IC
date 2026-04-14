import Link from "next/link";
import { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { isClerkEnabled } from "@/lib/clerk-config";
import { getPermissionKeysForUser } from "@/lib/permissions";
import { SignOutControl } from "@/components/sign-out-control";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const keys = user ? await getPermissionKeysForUser(user.id, user.isSuperAdmin) : null;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/home" className="text-sm font-semibold tracking-tight">
              J.D. Phoebe · Internal
            </Link>
            {user ? (
              <nav className="flex flex-wrap items-center gap-3 text-sm text-[hsl(var(--muted))]">
                {keys?.has("project.read") ? (
                  <Link className="hover:text-[hsl(var(--foreground))]" href="/home">
                    Home
                  </Link>
                ) : null}
                {keys?.has("org.group.read") ? (
                  <Link className="hover:text-[hsl(var(--foreground))]" href="/group">
                    Group
                  </Link>
                ) : null}
                {keys?.has("company.read") ? (
                  <Link className="hover:text-[hsl(var(--foreground))]" href="/companies">
                    Companies
                  </Link>
                ) : null}
                {keys?.has("project.read") ? (
                  <Link className="hover:text-[hsl(var(--foreground))]" href="/projects">
                    Projects
                  </Link>
                ) : null}
                {keys?.has("knowledge.read") ? (
                  <Link className="hover:text-[hsl(var(--foreground))]" href="/knowledge">
                    Knowledge
                  </Link>
                ) : null}
                {keys?.has("staff.read") ? (
                  <Link className="hover:text-[hsl(var(--foreground))]" href="/staff">
                    Staff
                  </Link>
                ) : null}
                {keys?.has("role.display_name.update") ? (
                  <Link className="hover:text-[hsl(var(--foreground))]" href="/settings/roles">
                    Roles
                  </Link>
                ) : null}
                {keys?.has("permission.matrix.read") ? (
                  <Link className="hover:text-[hsl(var(--foreground))]" href="/settings/permissions">
                    Permissions
                  </Link>
                ) : null}
                {keys?.has("trash.read") ? (
                  <Link className="hover:text-[hsl(var(--foreground))]" href="/trash">
                    Trash
                  </Link>
                ) : null}
                {keys?.has("leaderboard.read") ? (
                  <Link className="hover:text-[hsl(var(--foreground))]" href="/leaderboard">
                    Leaderboard
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </div>
          <div className="flex items-center gap-3 text-xs text-[hsl(var(--muted))]">
            {user ? (
              <>
                <span>
                  {user.name}
                  {user.isSuperAdmin ? " · Super Admin" : ""}
                </span>
                <SignOutControl clerkEnabled={isClerkEnabled()} />
              </>
            ) : (
              <Link className="font-medium text-[hsl(var(--accent))]" href={isClerkEnabled() ? "/sign-in" : "/login"}>
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}
