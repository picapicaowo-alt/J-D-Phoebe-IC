"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { closeAllOpenDialogs } from "@/components/dialog-launcher";
import { cn } from "@/lib/utils";

export type AppNavItem = { href: string; label: string };

function isActive(pathname: string, href: string) {
  if (href === "/home") return pathname === "/home" || pathname === "/";
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export function AppNav({ items }: { items: AppNavItem[] }) {
  const pathname = usePathname() || "";

  return (
    <nav
      className="-mx-1 flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto overflow-y-hidden px-1 pb-0.5 [scrollbar-width:thin]"
      aria-label="Main"
    >
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => closeAllOpenDialogs()}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-[hsl(var(--primary))]/12 text-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]/25"
                : "text-[hsl(var(--muted))] hover:bg-black/[0.04] hover:text-[hsl(var(--foreground))] dark:hover:bg-white/[0.06]",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
