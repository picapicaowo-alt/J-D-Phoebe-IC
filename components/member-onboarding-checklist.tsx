"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  toggleMemberOnboardingChecklistAction,
  type ToggleMemberOnboardingChecklistActionResult,
} from "@/app/actions/lifecycle";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/locale";
import { t, type MessageKey } from "@/lib/messages";

const KEY_TO_MSG: Record<string, MessageKey> = {
  OB_READ_PACKAGE: "onboardingObReadPackage",
  OB_ACK_POLICIES: "onboardingObAckPolicies",
  OB_SUPERVISOR_MEET: "onboardingObSupervisorMeet",
};

type ChecklistItem = { id: string; itemKey: string; completedAt: Date | null };

function errorMessageKey(
  code: Extract<ToggleMemberOnboardingChecklistActionResult, { ok: false }>["code"] | null,
): MessageKey | null {
  if (code === "materials") return "onboardingErrMaterials";
  if (code === "order") return "onboardingErrOrder";
  return null;
}

export function MemberOnboardingChecklist({
  items,
  locale,
  readOnly,
  materialsOpenedAt,
}: {
  items: ChecklistItem[];
  locale: Locale;
  readOnly?: boolean;
  materialsOpenedAt: Date | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [localItems, setLocalItems] = useState(items);
  const [errorCode, setErrorCode] = useState<Extract<ToggleMemberOnboardingChecklistActionResult, { ok: false }>["code"] | null>(null);

  useEffect(() => {
    setLocalItems(items);
    setErrorCode(null);
  }, [items]);

  const orderLockedIds = useMemo(() => {
    const locked = new Set<string>();
    for (let i = 1; i < localItems.length; i += 1) {
      if (!localItems[i]?.completedAt && !localItems[i - 1]?.completedAt) {
        locked.add(localItems[i]!.id);
      }
    }
    return locked;
  }, [localItems]);

  function toggleItem(itemId: string) {
    const currentItems = localItems;
    const currentItem = currentItems.find((entry) => entry.id === itemId);
    if (!currentItem || readOnly || pending) return;

    const isGateLocked = currentItem.itemKey === "OB_READ_PACKAGE" && !materialsOpenedAt && !currentItem.completedAt;
    const isOrderLocked = orderLockedIds.has(itemId);
    if (isGateLocked || isOrderLocked) {
      setErrorCode(isGateLocked ? "materials" : "order");
      return;
    }

    const optimisticItems = currentItems.map((entry) =>
      entry.id === itemId ? { ...entry, completedAt: entry.completedAt ? null : new Date() } : entry,
    );
    setErrorCode(null);
    setLocalItems(optimisticItems);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("itemId", itemId);

      try {
        const result = await toggleMemberOnboardingChecklistAction(formData);
        if (!result.ok) {
          setLocalItems(currentItems);
          setErrorCode(result.code);
          return;
        }

        setLocalItems((prev) =>
          prev.map((entry) =>
            entry.id === result.itemId
              ? {
                  ...entry,
                  completedAt: result.completedAt ? new Date(result.completedAt) : null,
                }
              : entry,
          ),
        );
        router.refresh();
      } catch (error) {
        console.error("[member onboarding checklist toggle]", error);
        setLocalItems(currentItems);
      }
    });
  }

  const errorKey = errorMessageKey(errorCode);

  return (
    <div className="space-y-2">
      {errorKey ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-[hsl(var(--foreground))]">
          {t(locale, errorKey)}
        </p>
      ) : null}
      <ul className="space-y-2">
        {localItems.map((it) => {
          const labelKey = KEY_TO_MSG[it.itemKey] ?? "onboardingObReadPackage";
          const gateFirst = it.itemKey === "OB_READ_PACKAGE" && !materialsOpenedAt && !it.completedAt && !readOnly;
          const orderLocked = orderLockedIds.has(it.id);
          const disabled = Boolean(readOnly || pending || gateFirst || orderLocked);
          const disabledTitle = gateFirst ? t(locale, "onboardingMaterialsAckHelp") : orderLocked ? t(locale, "onboardingErrOrder") : undefined;

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
                <Button
                  type="button"
                  variant="ghost"
                  disabled={disabled}
                  title={disabledTitle}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-[hsl(var(--border))] p-0 text-xs text-[hsl(var(--primary))] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-pressed={Boolean(it.completedAt)}
                  aria-label={t(locale, labelKey)}
                  onClick={() => toggleItem(it.id)}
                >
                  {it.completedAt ? "✓" : ""}
                </Button>
              )}
              <span className={`text-base leading-relaxed ${it.completedAt ? "text-[hsl(var(--muted))] line-through" : "text-[hsl(var(--foreground))]"}`}>
                {t(locale, labelKey)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
