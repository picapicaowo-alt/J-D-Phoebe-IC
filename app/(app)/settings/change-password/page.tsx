import { changePasswordAction } from "@/app/actions/auth";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser({ skipPasswordResetGate: true });
  const locale = await getLocale();
  const sp = await searchParams;
  const err = String(sp.error ?? "").trim();

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">{t(locale, "settingsChangePasswordTitle")}</h1>
        <p className="mt-2 text-base leading-relaxed text-[hsl(var(--muted))]">{t(locale, "settingsChangePasswordLead")}</p>
      </div>
      <Card className="space-y-4 p-6">
        <CardTitle className="text-base">{t(locale, "settingsChangePasswordTitle")}</CardTitle>
        {err === "invalid" ? (
          <p className="text-sm text-rose-600 dark:text-rose-400">{t(locale, "settingsChangePasswordErrInvalid")}</p>
        ) : null}
        {err === "current" ? (
          <p className="text-sm text-rose-600 dark:text-rose-400">{t(locale, "settingsChangePasswordErrCurrent")}</p>
        ) : null}
        <form action={changePasswordAction} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">{t(locale, "settingsChangePasswordCurrent")}</label>
            <Input name="currentPassword" type="password" required autoComplete="current-password" className="text-base" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">{t(locale, "settingsChangePasswordNew")}</label>
            <Input name="newPassword" type="password" required minLength={8} autoComplete="new-password" className="text-base" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">{t(locale, "settingsChangePasswordConfirm")}</label>
            <Input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" className="text-base" />
          </div>
          <FormSubmitButton type="submit" className="w-full">
            {t(locale, "settingsChangePasswordSubmit")}
          </FormSubmitButton>
        </form>
      </Card>
    </div>
  );
}
