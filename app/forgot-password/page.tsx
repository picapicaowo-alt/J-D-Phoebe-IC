import Link from "next/link";
import { redirect } from "next/navigation";
import { requestPasswordResetAction } from "@/app/actions/auth";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { isClerkEnabled } from "@/lib/clerk-config";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  if (isClerkEnabled()) redirect("/sign-in");

  const locale = await getLocale();
  const sp = await searchParams;
  const sent = String(sp.sent ?? "") === "1";
  const err = String(sp.error ?? "").trim();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <div className="mb-8 space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">J.D. Phoebe Group</h1>
        <p className="text-sm text-[hsl(var(--muted))]">Internal management platform (prototype)</p>
      </div>

      <Card className="space-y-4 p-6">
        <CardTitle>{t(locale, "passwordForgotTitle")}</CardTitle>
        <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "passwordForgotLead")}</p>
        {sent ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {t(locale, "passwordForgotSent")}
          </p>
        ) : null}
        {err === "email_unavailable" ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t(locale, "passwordForgotErrUnavailable")}
          </p>
        ) : null}
        {err === "send_failed" ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {t(locale, "passwordForgotErrSendFailed")}
          </p>
        ) : null}
        <form action={requestPasswordResetAction} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[hsl(var(--muted))]" htmlFor="email">
              {t(locale, "passwordForgotEmail")}
            </label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <FormSubmitButton type="submit" className="w-full">
            {t(locale, "passwordForgotSubmit")}
          </FormSubmitButton>
        </form>
      </Card>

      <p className="mt-6 text-center text-sm text-[hsl(var(--muted))]">
        <Link className="underline" href="/login">
          {t(locale, "passwordResetBackToLogin")}
        </Link>
      </p>
    </main>
  );
}
