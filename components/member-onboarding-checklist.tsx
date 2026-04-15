"use client";

import { toggleMemberOnboardingChecklistAction } from "@/app/actions/lifecycle";
import { FormSubmitButton } from "@/components/form-submit-button";
import type { Locale } from "@/lib/locale";
import { t, type MessageKey } from "@/lib/messages";

const KEY_TO_MSG: Record<string, MessageKey> = {
  OB_READ_PACKAGE: "onboardingObReadPackage",
  OB_ACK_POLICIES: "onboardingObAckPolicies",
  OB_SUPERVISOR_MEET: "onboardingObSupervisorMeet",
};

export function MemberOnboardingChecklist({
  items,
  locale,
  readOnly,
  materialsOpenedAt,
}: {
  items: { id: string; itemKey: string; completedAt: Date | null }[];
  locale: Locale;
  readOnly?: boolean;
  materialsOpenedAt: Date | null;
}) {
  return (
    <ul className="space-y-2">
      {items.map((it) => {
        const labelKey = KEY_TO_MSG[it.itemKey] ?? "onboardingObReadPackage";
        const gateFirst = it.itemKey === "OB_READ_PACKAGE" && !materialsOpenedAt && !it.completedAt && !readOnly;
        return (
          <li
            key={it.id}
            className="flex items-start gap-3 rounded-[12px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 transition-shadow hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)]"
          >
            {readOnly ? (
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--border))] text-xs text-[hsl(var(--primary))]"
                aria-hidden
              >
                {it.completedAt ? "✓" : ""}
              </span>
            ) : (
              <form action={toggleMemberOnboardingChecklistAction}>
                <input type="hidden" name="itemId" value={it.id} />
                <FormSubmitButton
                  type="submit"
                  variant="ghost"
                  disabled={gateFirst}
                  title={gateFirst ? t(locale, "onboardingMaterialsAckHelp") : undefined}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-[hsl(var(--border))] p-0 text-xs text-[hsl(var(--primary))] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-pressed={Boolean(it.completedAt)}
                  pendingLabel=""
                >
                  {it.completedAt ? "✓" : ""}
                </FormSubmitButton>
              </form>
            )}
            <span className={`text-base leading-relaxed ${it.completedAt ? "text-[hsl(var(--muted))] line-through" : "text-[hsl(var(--foreground))]"}`}>
              {t(locale, labelKey)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
