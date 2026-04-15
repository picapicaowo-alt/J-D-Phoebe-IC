"use client";

import { useFormState, useFormStatus } from "react-dom";
import { registerFormAction, type RegisterActionResult } from "@/app/actions/register";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/lib/locale";
import { t, type MessageKey } from "@/lib/messages";

type Props = { locale: Locale };

function messageFor(result: RegisterActionResult | null, locale: Locale): string {
  if (!result) return "";
  return t(locale, result.messageKey as MessageKey);
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "…" : label}
    </Button>
  );
}

export function HomeRegisterForm({ locale }: Props) {
  const [state, formAction] = useFormState(registerFormAction, null);
  const error = messageFor(state, locale);

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-[hsl(var(--muted))]" htmlFor="reg-name">
          {t(locale, "homeRegisterName")}
        </label>
        <Input id="reg-name" name="name" type="text" autoComplete="name" required maxLength={120} />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-[hsl(var(--muted))]" htmlFor="reg-email">
          {t(locale, "homeRegisterEmail")}
        </label>
        <Input id="reg-email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-[hsl(var(--muted))]" htmlFor="reg-password">
          {t(locale, "homeRegisterPassword")}
        </label>
        <Input id="reg-password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </div>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <SubmitButton label={t(locale, "homeRegisterSubmit")} />
    </form>
  );
}
