"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type ShellNavLink = { href: string; label: string; description?: string };
export type ShellNavDropdown = { id: string; label: string; items: ShellNavLink[] };

function isActive(pathname: string, href: string) {
  if (href === "/home") return pathname === "/home" || pathname === "/";
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

function dropdownActive(pathname: string, items: ShellNavLink[]) {
  return items.some((i) => isActive(pathname, i.href));
}

function NavLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      className={cn(
        "shrink-0 rounded-full px-3 py-1.5 text-base font-medium transition-colors",
        active
          ? "bg-[hsl(var(--primary))]/12 text-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]/25"
          : "text-[hsl(var(--muted))] hover:bg-black/[0.04] hover:text-[hsl(var(--foreground))] dark:hover:bg-white/[0.06]",
      )}
    >
      {label}
    </Link>
  );
}

function NavDropdown({
  dd,
  pathname,
  openId,
  setOpenId,
}: {
  dd: ShellNavDropdown;
  pathname: string;
  openId: string | null;
  setOpenId: Dispatch<SetStateAction<string | null>>;
}) {
  const open = openId === dd.id;
  const active = dropdownActive(pathname, dd.items);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current != null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      setOpenId((cur) => (cur === dd.id ? null : cur));
      closeTimerRef.current = null;
    }, 200);
  }, [cancelClose, dd.id, setOpenId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpenId]);

  useEffect(
    () => () => {
      if (closeTimerRef.current != null) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  const toggle = useCallback(() => {
    cancelClose();
    setOpenId(open ? null : dd.id);
  }, [cancelClose, dd.id, open, setOpenId]);

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
      onPointerEnter={() => {
        cancelClose();
        setOpenId(dd.id);
      }}
      onPointerLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "flex items-center gap-1 rounded-full px-3 py-1.5 text-base font-medium transition-colors",
          open || active
            ? "bg-[hsl(var(--primary))]/12 text-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]/25"
            : "text-[hsl(var(--muted))] hover:bg-black/[0.04] hover:text-[hsl(var(--foreground))] dark:hover:bg-white/[0.06]",
        )}
      >
        {dd.label}
        <span className={cn("text-sm opacity-80 transition-transform duration-200", open ? "rotate-180" : "")} aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div
          className="absolute left-0 top-full z-[100] min-w-[min(100vw-2rem,22rem)] max-w-[min(100vw-1.5rem,26rem)] pt-1"
          role="presentation"
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
        >
          <div
            className="max-h-[min(70vh,26rem)] overflow-y-auto overflow-x-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-2 shadow-xl ring-1 ring-black/[0.06] dark:ring-white/10"
            role="menu"
          >
            {dd.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => {
                  cancelClose();
                  setOpenId(null);
                }}
                className={cn(
                  "block px-4 py-3.5 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
                  isActive(pathname, item.href) ? "bg-[hsl(var(--primary))]/8" : "",
                )}
              >
                <div className={cn("text-base font-semibold", isActive(pathname, item.href) ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--foreground))]")}>
                  {item.label}
                </div>
                {item.description ? <p className="mt-0.5 text-sm leading-snug text-[hsl(var(--muted))]">{item.description}</p> : null}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AppShellNav({
  primaryLinks,
  dropdowns,
}: {
  primaryLinks: ShellNavLink[];
  dropdowns: ShellNavDropdown[];
}) {
  const pathname = usePathname() || "";
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <nav
      className="-mx-1 flex max-w-full flex-wrap items-center gap-1 px-1 pb-0.5 [scrollbar-width:thin]"
      aria-label="Main"
    >
      {primaryLinks.map((item) => (
        <NavLink key={item.href} href={item.href} label={item.label} pathname={pathname} />
      ))}
      {dropdowns.map((dd) => (
        <NavDropdown key={dd.id} dd={dd} pathname={pathname} openId={openId} setOpenId={setOpenId} />
      ))}
    </nav>
  );
}
