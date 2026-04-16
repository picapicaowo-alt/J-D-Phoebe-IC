import Link from "next/link";
import { redirect } from "next/navigation";
import { resetPasswordAction } from "@/app/actions/auth";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { isClerkEnabled } from "@/lib/clerk-config";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { parsePasswordResetToken, verifyPasswordResetToken } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  if (isClerkEnabled()) redirect("/sign-in");

  const locale = await getLocale();
  const sp = await searchParams;
  const token = String(sp.token ?? "").trim();
  const err = String(sp.error ?? "").trim();

  let valid = false;
  if (token) {
    const payload = parsePasswordResetToken(token);
    if (payload) {
      const user = await prisma.user.findUnique({
        where: { id: payload.uid },
        select: { id: true, email: true, passwordHash: true, active: true },
      });
      if (user?.active && user.passwordHash) {
        valid = verifyPasswordResetToken({
          token,
          userId: user.id,
          email: user.email,
          passwordHash: user.passwordHash,
        }).ok;
      }
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <div className="mb-8 space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">J.D. Phoebe Group</h1>
        <p className="text-sm text-[hsl(var(--muted))]">Internal management platform (prototype)</p>
      </div>

      <Card className="space-y-4 p-6">
        <CardTitle>{t(locale, "passwordResetTitle")}</CardTitle>
        {valid ? (
          <>
            <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "passwordResetLead")}</p>
            {err === "invalid" ? (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {t(locale, "settingsChangePasswordErrInvalid")}
              </p>
            ) : null}
            <form action={resetPasswordAction} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <div className="space-y-1">
                <label className="text-sm font-medium">{t(locale, "settingsChangePasswordNew")}</label>
                <Input name="newPassword" type="password" required minLength={8} autoComplete="new-password" className="text-base" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t(locale, "settingsChangePasswordConfirm")}</label>
                <Input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" className="text-base" />
              </div>
              <FormSubmitButton type="submit" className="w-full">
                {t(locale, "passwordResetSubmit")}
              </FormSubmitButton>
            </form>
          </>
        ) : (
          <>
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {t(locale, "passwordResetErrInvalid")}
            </p>
            <div className="flex flex-col gap-2 text-sm">
              <Link className="underline" href="/forgot-password">
                {t(locale, "passwordResetRequestAnother")}
              </Link>
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
