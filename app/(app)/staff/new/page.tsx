import Link from "next/link";
import { startStaffInviteAction } from "@/app/actions/staff-invite";
import { requireUser } from "@/lib/auth";
import type { AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";

export default async function NewStaffPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = (await requireUser()) as AccessUser;
  const locale = await getLocale();
  const sp = await searchParams;
  const err = String(sp.error ?? "").trim();

  const ok =
    (await userHasPermission(user, "staff.create")) &&
    (user.isSuperAdmin || user.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN"));
  if (!ok) redirect("/staff");

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="text-xs text-[hsl(var(--muted))]">
        <Link className="hover:underline" href="/staff">
          {t(locale, "staffBreadcrumb")}
        </Link>{" "}
        / {t(locale, "staffNewBreadcrumbNew")}
      </div>
      <Card className="space-y-4 p-6">
        <CardTitle>{t(locale, "staffFormAddTitle")}</CardTitle>
        {err === "email_taken" ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{t(locale, "staffInviteErrEmailTaken")}</p>
        ) : null}
        {err === "email_not_configured" ? (
          <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm">{t(locale, "staffInviteErrEmailNotConfigured")}</p>
        ) : null}
        {err === "invite_expired" ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{t(locale, "staffInviteErrExpired")}</p>
        ) : null}
        {err === "too_many_attempts" ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{t(locale, "staffInviteErrTooManyAttempts")}</p>
        ) : null}
        {err === "forbidden" ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{t(locale, "staffInviteErrForbidden")}</p>
        ) : null}
        {err === "email_send_failed" ? (
          <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm">{t(locale, "staffInviteErrEmailSendFailed")}</p>
        ) : null}
        <form action={startStaffInviteAction} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">{t(locale, "staffFullName")}</label>
            <Input name="name" required />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">{t(locale, "staffWorkEmailLogin")}</label>
            <Input name="email" type="email" required />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">{t(locale, "staffInitialPassword")}</label>
            <Input name="password" type="password" required minLength={8} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">{t(locale, "staffTitle")}</label>
            <Input name="title" />
          </div>
          <FormSubmitButton type="submit">{t(locale, "staffInviteSendCode")}</FormSubmitButton>
        </form>
        <p className="text-base leading-relaxed text-[hsl(var(--muted))]">{t(locale, "staffForcePasswordChange")}</p>
        <p className="text-base leading-relaxed text-[hsl(var(--muted))]">{t(locale, "staffVerificationNote")}</p>
        <p className="text-base leading-relaxed text-[hsl(var(--muted))]">{t(locale, "staffEmailNoreplyHint")}</p>
        <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "staffCreateAssignHint")}</p>
      </Card>
    </div>
  );
}
