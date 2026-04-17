import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { markNotificationReadAction } from "@/app/actions/lifecycle";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Card, CardTitle } from "@/components/ui/card";
import { getUpcomingInboxReminders } from "@/lib/inbox-reminders";
import { formatInTimeZone } from "@/lib/timezone";

function formatReminderDate(when: Date, locale: "en" | "zh", timeZone: string) {
  return formatInTimeZone(when, {
    locale,
    timeZone,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default async function NotificationsPage() {
  const user = await requireUser();
  const locale = await getLocale();
  const [rows, reminders] = await Promise.all([
    prisma.inAppNotification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    getUpcomingInboxReminders(user.id, { windowDays: 7, limitPerKind: 20 }),
  ]);

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <h1 className="font-display text-2xl font-bold tracking-[-0.03em] text-[hsl(var(--foreground))]">{t(locale, "notificationsTitle")}</h1>
      <Card className="rounded-[12px] border border-[hsl(var(--border))] p-5">
        <CardTitle className="font-display mb-3 text-base font-bold">{t(locale, "notificationsTitle")}</CardTitle>
        {!rows.length ? (
          <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "notificationsEmpty")}</p>
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))]">
            {rows.map((n) => (
              <li key={n.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0">
                <div>
                  <p className={`text-sm font-medium ${n.readAt ? "text-[hsl(var(--muted))]" : "text-[hsl(var(--foreground))]"}`}>{n.title}</p>
                  {n.body ? <p className="mt-1 text-xs text-[hsl(var(--muted))]">{n.body}</p> : null}
                  {n.href ? (
                    <Link href={n.href} className="mt-2 inline-block text-xs font-medium text-[hsl(var(--primary))] hover:underline">
                      Open
                    </Link>
                  ) : null}
                </div>
                {!n.readAt ? (
                  <form action={markNotificationReadAction}>
                    <input type="hidden" name="notificationId" value={n.id} />
                    <FormSubmitButton type="submit" variant="secondary" className="h-8 rounded-[6px] text-xs">
                      {t(locale, "notificationsMarkRead")}
                    </FormSubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="rounded-[12px] border border-[hsl(var(--border))] p-5">
        <CardTitle className="font-display mb-3 text-base font-bold">{t(locale, "notificationsUpcomingTitle")}</CardTitle>
        {!reminders.length ? (
          <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "notificationsUpcomingEmpty")}</p>
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))]">
            {reminders.map((item) => (
              <li key={`${item.kind}:${item.id}`} className="py-3 first:pt-0">
                <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted))]">
                  {item.kind === "TODO_DUE" ? t(locale, "notificationsReminderTodo") : t(locale, "notificationsReminderMeeting")}
                </p>
                <Link href={item.href} className="mt-1 inline-block text-sm font-medium text-[hsl(var(--foreground))] hover:underline">
                  {item.title}
                </Link>
                <p className="mt-1 text-xs text-[hsl(var(--muted))]">
                  {t(locale, "notificationsReminderAt")}: {formatReminderDate(item.at, locale, user.timezone)}
                  {item.projectName ? ` · ${t(locale, "notificationsReminderProject")}: ${item.projectName}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
