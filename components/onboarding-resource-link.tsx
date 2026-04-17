"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

export function OnboardingResourceLink({
  onboardingId,
  href,
  className,
  children,
}: {
  onboardingId: string;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  function handleClick(_event: MouseEvent<HTMLAnchorElement>) {
    void fetch("/api/onboarding/material-open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboardingId }),
      keepalive: true,
    })
      .catch((error) => {
        console.error("[onboarding resource open]", error);
      })
      .finally(() => {
        router.refresh();
      });
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" className={className} onClick={handleClick}>
      {children}
    </a>
  );
}
