import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isClerkEnabled } from "@/lib/clerk-config";
import type { Locale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { SignOutControl } from "@/components/sign-out-control";
import { LocaleToggleHeader } from "@/components/locale-toggle-header";
import { MessagesHeaderLink } from "@/components/messages-header-link";
import { UserFace } from "@/components/user-face";

export async function AppShellHeaderControls({ locale }: { locale: Locale }) {
  const user = await getCurrentUser();

  if (!user?.active) {
    return (
      <Link
        className="font-medium text-[hsl(var(--primary))] underline-offset-4 hover:underline"
        href={isClerkEnabled() ? "/sign-in" : "/login"}
      >
        {t(locale, "signIn")}
      </Link>
    );
  }

  return (
    <>
      <LocaleToggleHeader locale={locale} />
      <div className="hidden h-4 w-px bg-[hsl(var(--border))] sm:block" aria-hidden />
      <MessagesHeaderLink locale={locale} initialUnreadCount={null} />
      <Link
        href="/settings/profile"
        prefetch={false}
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
  );
}
