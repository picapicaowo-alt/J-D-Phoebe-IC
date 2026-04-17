"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { skipMemberOnboardingAction } from "@/app/actions/lifecycle";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { cn } from "@/lib/utils";

const STAFF_ONBOARDING_STATUS_EVENT = "staff-onboarding-status-update";

export type StaffOnboardingStatusState = {
  id: string;
  deadlineAt: string;
  completedAt: string | null;
} | null;

type StaffOnboardingStatusEventDetail = {
  companyId: string;
  targetUserId: string;
  onboarding: StaffOnboardingStatusState;
};

function formatOnboardingTimestamp(value: string) {
  return value.slice(0, 16).replace("T", " ");
}

function emitStatus(detail: StaffOnboardingStatusEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<StaffOnboardingStatusEventDetail>(STAFF_ONBOARDING_STATUS_EVENT, { detail }));
}

export function StaffOnboardingStatusCard({
  companyId,
  targetUserId,
  title,
  onboarding,
  locale,
  canSkip,
  className,
}: {
  companyId: string;
  targetUserId: string;
  title: string;
  onboarding: StaffOnboardingStatusState;
  locale: Locale;
  canSkip: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(onboarding);

  useEffect(() => {
    setStatus(onboarding);
  }, [onboarding]);

  useEffect(() => {
    function handleEvent(event: Event) {
      const detail = (event as CustomEvent<StaffOnboardingStatusEventDetail>).detail;
      if (!detail || detail.companyId !== companyId || detail.targetUserId !== targetUserId) return;
      setStatus(detail.onboarding);
    }

    window.addEventListener(STAFF_ONBOARDING_STATUS_EVENT, handleEvent as EventListener);
    return () => window.removeEventListener(STAFF_ONBOARDING_STATUS_EVENT, handleEvent as EventListener);
  }, [companyId, targetUserId]);

  function syncStatus(next: StaffOnboardingStatusState) {
    setStatus(next);
    emitStatus({ companyId, targetUserId, onboarding: next });
  }

  function handleSkip() {
    if (pending || !canSkip || status?.completedAt) return;

    const previousStatus = status;
    const nowIso = new Date().toISOString();
    syncStatus(
      status
        ? { ...status, completedAt: nowIso }
        : {
            id: `optimistic:${companyId}`,
            deadlineAt: nowIso,
            completedAt: nowIso,
          },
    );

    startTransition(async () => {
      const formData = new FormData();
      if (previousStatus?.id) {
        formData.set("onboardingId", previousStatus.id);
      } else {
        formData.set("userId", targetUserId);
        formData.set("companyId", companyId);
      }

      try {
        const result = await skipMemberOnboardingAction(formData);
        if (!result.ok) {
          syncStatus(previousStatus);
          return;
        }

        syncStatus({
          id: result.onboardingId,
          deadlineAt: result.deadlineAt,
          completedAt: result.completedAt,
        });
        router.refresh();
      } catch (error) {
        console.error("[staff onboarding skip]", error);
        syncStatus(previousStatus);
      }
    });
  }

  return (
    <div className={cn("rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-[hsl(var(--foreground))]">{title}</p>
          <p className="mt-1 text-xs text-[hsl(var(--muted))]">
            {status?.completedAt
              ? `${t(locale, "onboardingCompletedAtLabel")}: ${formatOnboardingTimestamp(status.completedAt)}`
              : status
                ? `${t(locale, "onboardingDeadline")}: ${status.deadlineAt.slice(0, 10)}`
                : t(locale, "staffOnboardingNone")}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-xs ${
            status?.completedAt
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : status
                ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                : "bg-[hsl(var(--background))] text-[hsl(var(--muted))]"
          }`}
        >
          {status?.completedAt
            ? t(locale, "staffOnboardingComplete")
            : status
              ? t(locale, "staffOnboardingPending")
              : t(locale, "staffOnboardingNone")}
        </span>
      </div>
      {canSkip && (!status || !status.completedAt) ? (
        <Button type="button" variant="secondary" disabled={pending} onClick={handleSkip} className="mt-3 h-8 text-xs">
          {t(locale, "staffOnboardingSkipBtn")}
        </Button>
      ) : null}
    </div>
  );
}
