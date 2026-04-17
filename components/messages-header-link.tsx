"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useEffectEvent, useState } from "react";
import { cn } from "@/lib/utils";

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

async function fetchUnreadCount() {
  const response = await fetch("/api/messages/unread", { cache: "no-store" });
  const data = (await response.json().catch(() => null)) as { count?: number } | null;
  if (!response.ok) return null;
  return typeof data?.count === "number" ? data.count : null;
}

export function MessagesHeaderLink({
  locale,
  initialUnreadCount,
}: {
  locale: "en" | "zh";
  initialUnreadCount: number;
}) {
  const [count, setCount] = useState(initialUnreadCount);
  const pathname = usePathname();

  const refreshCount = useEffectEvent(async () => {
    const next = await fetchUnreadCount().catch(() => null);
    if (typeof next === "number") {
      setCount(next);
    }
  });

  useEffect(() => {
    const handleUnreadChanged = () => void refreshCount();
    window.addEventListener("messages:unread-changed", handleUnreadChanged);

    if (pathname === "/messages") {
      return () => {
        window.removeEventListener("messages:unread-changed", handleUnreadChanged);
      };
    }

    const source = new EventSource("/api/messages/stream");
    source.addEventListener("message", (event) => {
      const payload = parseJson<{ message?: { isOwn?: boolean } }>((event as MessageEvent<string>).data);
      if (payload?.message?.isOwn === false) {
        void refreshCount();
      }
    });

    return () => {
      source.close();
      window.removeEventListener("messages:unread-changed", handleUnreadChanged);
    };
  }, [pathname, refreshCount]);

  return (
    <Link
      href="/messages"
      prefetch={false}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition",
        count > 0
          ? "border-[hsl(var(--primary))]/25 bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
          : "border-[hsl(var(--border))] text-[hsl(var(--muted))] hover:bg-black/[0.04] hover:text-[hsl(var(--foreground))] dark:hover:bg-white/[0.06]",
      )}
    >
      <span>{locale === "zh" ? "消息" : "Messages"}</span>
      {count > 0 ? (
        <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-[hsl(var(--primary))] px-1.5 py-0.5 text-xs font-semibold text-white">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
