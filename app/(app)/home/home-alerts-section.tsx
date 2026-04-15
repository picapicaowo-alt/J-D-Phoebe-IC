import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { AccessUser } from "@/lib/access";
import { Card, CardTitle } from "@/components/ui/card";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";

export async function HomeAlertsSection({ user }: { user: AccessUser }) {
  const locale = await getLocale();
  const [unreadAlertCount, recentUnreadAlerts] = await Promise.all([
    prisma.inAppNotification.count({ where: { userId: user.id, readAt: null } }),
    prisma.inAppNotification.findMany({
      where: { userId: user.id, readAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  return (
    <Card className="border-zinc-200/90 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{t(locale, "homeAlertsTitle")}</CardTitle>
          <p className="mt-1 text-base text-zinc-600 dark:text-zinc-400">{t(locale, "homeAlertsLead")}</p>
        </div>
        <Link
          href="/me/notifications"
          className="shrink-0 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-base font-semibold text-white shadow-sm hover:opacity-95"
        >
          {unreadAlertCount ? `${t(locale, "homeAlertsOpen")} (${unreadAlertCount})` : t(locale, "homeAlertsOpen")}
        </Link>
      </div>
      {recentUnreadAlerts.length ? (
        <ul className="mt-3 space-y-2 border-t border-zinc-200/80 pt-3 dark:border-zinc-800">
          {recentUnreadAlerts.map((n) => (
            <li key={n.id} className="text-base text-zinc-800 dark:text-zinc-200">
              {n.href ? (
                <Link href={n.href} className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-50">
                  {n.title}
                </Link>
              ) : (
                <span className="font-medium">{n.title}</span>
              )}
              {n.body ? <p className="mt-0.5 text-base leading-snug text-zinc-600 dark:text-zinc-400">{n.body}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-base text-zinc-500 dark:text-zinc-400">{t(locale, "homeAlertsEmpty")}</p>
      )}
    </Card>
  );
}
