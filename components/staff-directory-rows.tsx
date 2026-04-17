"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { UserFace } from "@/components/user-face";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type StaffDirectoryRowDTO = {
  id: string;
  name: string;
  email: string;
  title: string | null;
  avatarUrl: string | null;
  active: boolean;
  isSuperAdmin: boolean;
  activeProjectCount: number;
  contactLine?: string | null;
  onboarding: { label: string; tone: "done" | "pending" | "none" };
  onboardingTimeline?: { key: string; label: string }[];
  companies: { key: string; label: string }[];
};

type Copy = {
  active: string;
  inactive: string;
  superAdmin: string;
  activeProjectsTpl: string;
  emDash: string;
  selectAll: string;
  clear: string;
  selectedTpl: string;
};

export function StaffDirectoryRows({ rows, copy }: { rows: StaffDirectoryRowDTO[]; copy: Copy }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);
  const pageIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected[id]);

  const toggleOne = useCallback((id: string) => {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }, []);

  const toggleAllPage = useCallback(() => {
    if (allSelected) {
      setSelected({});
    } else {
      const next: Record<string, boolean> = {};
      for (const id of pageIds) next[id] = true;
      setSelected(next);
    }
  }, [allSelected, pageIds]);

  const clear = useCallback(() => setSelected({}), []);

  return (
    <div className="space-y-3">
      {rows.length ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10 px-3 py-2 text-sm">
          <label className="flex cursor-pointer items-center gap-2 text-[hsl(var(--foreground))]">
            <span className="inline-flex shrink-0">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--ring))]"
                checked={allSelected}
                onChange={toggleAllPage}
                aria-label={copy.selectAll}
              />
            </span>
            <span>{copy.selectAll}</span>
          </label>
          {selectedIds.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[hsl(var(--muted))]">{copy.selectedTpl.replace("{n}", String(selectedIds.length))}</span>
              <Button type="button" variant="secondary" className="h-8 rounded-[8px] text-xs" onClick={clear}>
                {copy.clear}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {rows.map((s) => {
        const checked = !!selected[s.id];
        const ob = s.onboarding;
        return (
          <div
            key={s.id}
            className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm"
          >
            <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
              <label className="flex shrink-0 cursor-pointer items-start pt-1">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--ring))]"
                  checked={checked}
                  onChange={() => toggleOne(s.id)}
                  aria-label={s.name}
                />
              </label>
              <UserFace name={s.name} avatarUrl={s.avatarUrl} size={48} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <Link className="text-base font-semibold text-[hsl(var(--foreground))] hover:underline" href={`/staff/${s.id}`} prefetch={false}>
                  {s.name}
                </Link>
                {s.title ? <p className="text-sm text-[hsl(var(--muted))]">{s.title}</p> : <p className="text-sm text-[hsl(var(--muted))]">{s.email}</p>}
                {s.contactLine ? <p className="text-sm text-[hsl(var(--muted))]">{s.contactLine}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {s.companies.length ? (
                    s.companies.map((m) => (
                      <span
                        key={m.key}
                        className="inline-flex rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10 px-2.5 py-0.5 text-xs text-[hsl(var(--foreground))]"
                      >
                        {m.label}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-[hsl(var(--muted))]">{copy.emDash}</span>
                  )}
                </div>
                <p className="mt-2 text-xs text-[hsl(var(--muted))]">
                  {copy.activeProjectsTpl.replace("{n}", String(s.activeProjectCount))}
                </p>
                {s.onboardingTimeline?.length ? (
                  <div className="mt-2 space-y-1">
                    {s.onboardingTimeline.map((item) => (
                      <p key={item.key} className="text-xs text-[hsl(var(--muted))]">
                        {item.label}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              {s.active ? (
                <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                  {copy.active}
                </span>
              ) : (
                <span className="rounded-full border border-[hsl(var(--border))] bg-transparent px-3 py-1 text-xs font-medium text-[hsl(var(--muted))]">
                  {copy.inactive}
                </span>
              )}
              <span
                className={cn(
                  "max-w-[14rem] rounded-full border px-3 py-1 text-center text-xs font-medium",
                  ob.tone === "done" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
                  ob.tone === "pending" && "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100",
                  ob.tone === "none" && "border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10 text-[hsl(var(--muted))]",
                )}
              >
                {ob.label}
              </span>
              {s.isSuperAdmin ? <span className="text-xs text-[hsl(var(--muted))]">{copy.superAdmin}</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
