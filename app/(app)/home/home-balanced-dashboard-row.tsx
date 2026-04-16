"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const LARGE_SCREEN_QUERY = "(min-width: 1024px)";

export function HomeBalancedDashboardRow({
  priorities,
  sidebar,
}: {
  priorities: ReactNode;
  sidebar: ReactNode;
}) {
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const [prioritiesHeight, setPrioritiesHeight] = useState<number | null>(null);

  useEffect(() => {
    const sidebarEl = sidebarRef.current;
    if (!sidebarEl) return;

    const mediaQuery = window.matchMedia(LARGE_SCREEN_QUERY);

    const syncHeight = () => {
      if (!mediaQuery.matches) {
        setPrioritiesHeight(null);
        return;
      }
      setPrioritiesHeight(Math.round(sidebarEl.getBoundingClientRect().height));
    };

    syncHeight();

    const observer = new ResizeObserver(() => {
      syncHeight();
    });
    observer.observe(sidebarEl);

    const handleViewportChange = () => {
      syncHeight();
    };

    mediaQuery.addEventListener("change", handleViewportChange);
    window.addEventListener("resize", handleViewportChange);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", handleViewportChange);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, []);

  return (
    <>
      <div className="flex lg:col-span-2 lg:min-h-0" style={prioritiesHeight ? { height: `${prioritiesHeight}px` } : undefined}>
        {priorities}
      </div>
      <div ref={sidebarRef} className="flex flex-col gap-4">
        {sidebar}
      </div>
    </>
  );
}
