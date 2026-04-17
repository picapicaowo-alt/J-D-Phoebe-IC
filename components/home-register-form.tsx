"use client";

import { useFormState } from "react-dom";
import { registerFormAction, type RegisterActionResult } from "@/app/actions/register";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/lib/locale";
import { t, type MessageKey } from "@/lib/messages";

type Props = { locale: Locale };

function messageFor(result: RegisterActionResult | null, locale: Locale): { text: string; tone: "success" | "error" } | null {
  if (!result) return null;
  return {
    text: t(locale, result.messageKey as MessageKey),
    tone: result.ok ? "success" : "error",
  };
}

export function HomeRegisterForm({ locale }: Props) {
  const [state, formAction] = useFormState(registerFormAction, null);
  const message = messageFor(state, locale);

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
      {message ? (
        <p
          className={
            message.tone === "success"
              ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
              : "rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
          }
        >
          {message.text}
        </p>
      ) : null}
      <FormSubmitButton type="submit" className="w-full" pendingLabel="…">
        {t(locale, "homeRegisterSubmit")}
      </FormSubmitButton>
    </form>
  );
}
