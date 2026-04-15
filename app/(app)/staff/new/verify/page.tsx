import Link from "next/link";
import { redirect } from "next/navigation";
import { confirmStaffInviteAction } from "@/app/actions/staff-invite";
import { requireUser } from "@/lib/auth";
import type { AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";

export default async function StaffInviteVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ inviteId?: string; error?: string }>;
}) {
  const actor = (await requireUser()) as AccessUser;
  const locale = await getLocale();
  const sp = await searchParams;
  const inviteId = String(sp.inviteId ?? "").trim();
  const err = String(sp.error ?? "").trim();

  const ok =
    (await userHasPermission(actor, "staff.create")) &&
    (actor.isSuperAdmin || actor.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN"));
  if (!ok) redirect("/staff");
  if (!inviteId) redirect("/staff/new");

  const invite = await prisma.staffInvite.findFirst({
    where: { id: inviteId, consumedAt: null, createdByUserId: actor.id },
  });
  if (!invite) redirect("/staff/new?error=forbidden");

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="text-xs text-[hsl(var(--muted))]">
        <Link className="hover:underline" href="/staff">
          {t(locale, "staffBreadcrumb")}
        </Link>{" "}
        / <Link href="/staff/new">{t(locale, "staffNewBreadcrumbNew")}</Link> / {t(locale, "staffInviteVerifyTitle")}
      </div>
      <Card className="space-y-4 p-6">
        <CardTitle>{t(locale, "staffInviteVerifyTitle")}</CardTitle>
        <p className="text-base leading-relaxed text-[hsl(var(--muted))]">
          {t(locale, "staffInviteVerifyLead").replace("{email}", invite.email)}
        </p>
        {process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{t(locale, "staffInviteDevOtpHint")}</p>
        ) : null}
        {err === "bad_otp" ? (
          <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm">{t(locale, "staffInviteErrBadOtp")}</p>
        ) : null}
        <form action={confirmStaffInviteAction} className="space-y-3">
          <input type="hidden" name="inviteId" value={inviteId} />
          <div className="space-y-1">
            <label className="text-xs font-medium">{t(locale, "staffInviteOtpLabel")}</label>
            <Input name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={8} required placeholder="000000" />
          </div>
          <FormSubmitButton type="submit">{t(locale, "staffInviteVerifySubmit")}</FormSubmitButton>
        </form>
      </Card>
    </div>
  );
}
