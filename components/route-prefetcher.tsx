"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const shouldPrefetchRoutes = process.env.NODE_ENV !== "test";

export function RoutePrefetcher({ hrefs, limit = 24 }: { hrefs: string[]; limit?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (!shouldPrefetchRoutes) return;
    const unique = [...new Set(hrefs)].filter(Boolean).slice(0, limit);
    if (!unique.length) return;

    let cancelled = false;
    const warmRoutes = () => {
      unique.forEach((href, index) => {
        window.setTimeout(() => {
          if (!cancelled) router.prefetch(href);
        }, index * 80);
      });
    };

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(warmRoutes, { timeout: 1000 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }

    const timer = globalThis.setTimeout(warmRoutes, 200);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
  }, [hrefs, limit, router]);

  return null;
}
