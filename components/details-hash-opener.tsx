"use client";

import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";

function DetailsHashOpenerInner() {
  const pathname = usePathname();

  useEffect(() => {
    const applyHash = () => {
      const id = window.location.hash.replace(/^#/, "");
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
      }
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [pathname]);

  return null;
}

export function DetailsHashOpener() {
  return (
    <Suspense fallback={null}>
      <DetailsHashOpenerInner />
    </Suspense>
  );
}
