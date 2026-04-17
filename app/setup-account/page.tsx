import Link from "next/link";
import { redirect } from "next/navigation";
import { completeAccountSetupAction } from "@/app/actions/account-setup";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { parseAccountSetupToken, verifyAccountSetupToken } from "@/lib/account-setup";
import { isClerkEnabled } from "@/lib/clerk-config";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { prisma } from "@/lib/prisma";

export default async function SetupAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  if (isClerkEnabled()) redirect("/sign-in");

  const locale = await getLocale();
  const sp = await searchParams;
  const token = String(sp.token ?? "").trim();
  const err = String(sp.error ?? "").trim();
  const parsedPayload = token ? parseAccountSetupToken(token) : null;

  const verification = token ? verifyAccountSetupToken(token) : { ok: false as const };

  let valid = false;
  let name = "";
  let email = "";

  if (verification.ok) {
    if (verification.payload.kind === "register") {
      valid = true;
      name = verification.payload.name;
      email = verification.payload.email;
    } else {
      const invite = await prisma.staffInvite.findFirst({
        where: { id: verification.payload.inviteId, consumedAt: null },
        select: { id: true, name: true, email: true, expiresAt: true },
      });

      if (invite && invite.email === verification.payload.email && invite.expiresAt.getTime() > Date.now()) {
        valid = true;
        name = invite.name;
        email = invite.email;
      }
    }
  } else if (parsedPayload?.kind === "register") {
    name = parsedPayload.name;
    email = parsedPayload.email;
  } else if (parsedPayload?.kind === "staff_invite") {
    email = parsedPayload.email;
  }

  const showRegisterRetry = parsedPayload?.kind !== "staff_invite";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <div className="mb-8 space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">J.D. Phoebe Group</h1>
        <p className="text-sm text-[hsl(var(--muted))]">Internal management platform (prototype)</p>
      </div>

      <Card className="space-y-4 p-6">
        <CardTitle>{t(locale, "accountSetupTitle")}</CardTitle>
        {valid ? (
          <>
            <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "accountSetupLead")}</p>
            {err === "invalid_password" ? (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {t(locale, "settingsChangePasswordErrInvalid")}
              </p>
            ) : null}
            {err === "email_taken" ? (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {t(locale, "accountSetupErrEmailTaken")}
              </p>
            ) : null}
            {err === "setup_missing" ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {t(locale, "registerSetupMissing")}
              </p>
            ) : null}
            <form action={completeAccountSetupAction} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <div className="space-y-1">
                <label className="text-sm font-medium">{t(locale, "homeRegisterName")}</label>
                <Input value={name} readOnly className="text-base" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t(locale, "homeRegisterEmail")}</label>
                <Input value={email} readOnly className="text-base" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t(locale, "accountSetupPassword")}</label>
                <Input name="newPassword" type="password" required minLength={8} autoComplete="new-password" className="text-base" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t(locale, "accountSetupPasswordConfirm")}</label>
                <Input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" className="text-base" />
              </div>
              <FormSubmitButton type="submit" className="w-full">
                {t(locale, "accountSetupSubmit")}
              </FormSubmitButton>
            </form>
          </>
        ) : (
          <>
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {t(locale, "accountSetupErrInvalid")}
            </p>
            <div className="flex flex-col gap-2 text-sm">
              {showRegisterRetry ? (
                <Link className="underline" href="/register">
                  {t(locale, "accountSetupRequestAnother")}
                </Link>
              ) : (
                <p className="text-[hsl(var(--muted))]">{t(locale, "accountSetupAskAdmin")}</p>
              )}
              <Link className="underline" href="/login">
                {t(locale, "passwordResetBackToLogin")}
              </Link>
            </div>
          </>
        )}
      </Card>
    </main>
  );
}
