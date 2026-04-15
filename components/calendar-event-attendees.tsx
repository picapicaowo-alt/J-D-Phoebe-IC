"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

export type CalendarStaffOption = { id: string; name: string; email: string };

type Props = {
  staffOptions: CalendarStaffOption[];
  organizerUserId: string;
  initialSelectedIds?: string[];
  initialExternalEmails?: string[];
  labels: {
    staffTitle: string;
    staffSearch: string;
    staffHint: string;
    staffNoMatch: string;
    staffNoMore: string;
    remove: string;
    externalTitle: string;
    externalHint: string;
  };
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function parseExternalEmails(raw: string): string[] {
  const parts = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  return [...new Set(parts.filter((e) => EMAIL_RE.test(e)))];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function CalendarEventAttendeesFields({
  staffOptions,
  organizerUserId,
  initialSelectedIds = [],
  initialExternalEmails = [],
  labels,
}: Props) {
  const pickable = useMemo(
    () => staffOptions.filter((u) => u.id !== organizerUserId).sort((a, b) => a.name.localeCompare(b.name)),
    [staffOptions, organizerUserId],
  );

  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);
  const [query, setQuery] = useState("");
  const [externalDraft, setExternalDraft] = useState(initialExternalEmails.join(", "));

  const q = query.trim().replace(/^@+/, "").toLowerCase();
  const suggestions = useMemo(() => {
    if (!q) return pickable.filter((u) => !selectedIds.includes(u.id)).slice(0, 10);
    return pickable
      .filter((u) => !selectedIds.includes(u.id))
      .filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 12);
  }, [pickable, q, selectedIds]);

  const externalSerialized = parseExternalEmails(externalDraft).join(",");
  const externalEmails = parseExternalEmails(externalDraft);
  const selectedStaff = selectedIds
    .map((id) => staffOptions.find((x) => x.id === id))
    .filter((u): u is CalendarStaffOption => Boolean(u));

  const add = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setQuery("");
  };

  const remove = (id: string) => setSelectedIds((prev) => prev.filter((x) => x !== id));

  return (
    <div className="space-y-4 sm:col-span-2">
      <input type="hidden" name="attendeeIds" value={selectedIds.join(",")} readOnly />
      <input type="hidden" name="externalEmails" value={externalSerialized} readOnly />

      <div className="space-y-1">
        <label className="text-sm font-medium text-[hsl(var(--muted))]">{labels.staffTitle}</label>
        <p className="text-xs text-[hsl(var(--muted))]">{labels.staffHint}</p>
        <div className="space-y-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded-[6px]"
            placeholder={labels.staffSearch}
            autoComplete="off"
          />
          <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]/60">
            {suggestions.length ? (
              <ul className="max-h-44 overflow-y-auto p-1 text-sm" role="listbox">
              {suggestions.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                    onClick={() => add(u.id)}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))]/12 text-xs font-semibold text-[hsl(var(--primary))]">
                      {initials(u.name) || "@"}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-[hsl(var(--foreground))]">@{u.name}</span>
                      <span className="block truncate text-xs text-[hsl(var(--muted))]">{u.email}</span>
                    </span>
                  </button>
                </li>
              ))}
              </ul>
            ) : (
              <p className="px-3 py-3 text-xs text-[hsl(var(--muted))]">
                {query.trim() ? labels.staffNoMatch : labels.staffNoMore}
              </p>
            )}
          </div>
        </div>
        {selectedStaff.length ? (
          <div className="mt-2 space-y-2">
            {selectedStaff.map((u) => {
              return (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-[hsl(var(--foreground))]">@{u.name}</span>
                    <span className="block truncate text-xs text-[hsl(var(--muted))]">{u.email}</span>
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-[hsl(var(--muted))] hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                    onClick={() => remove(u.id)}
                    aria-label={`Remove ${u.name}`}
                  >
                    {labels.remove}
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-[hsl(var(--muted))]">{labels.externalTitle}</label>
        <p className="text-xs text-[hsl(var(--muted))]">{labels.externalHint}</p>
        <Input
          value={externalDraft}
          onChange={(e) => setExternalDraft(e.target.value)}
          className="rounded-[6px]"
          placeholder="name@company.com, other@…"
          autoComplete="off"
        />
        {externalEmails.length ? (
          <div className="flex flex-wrap gap-2">
            {externalEmails.map((email) => (
              <span
                key={email}
                className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10 px-2.5 py-1 text-xs text-[hsl(var(--foreground))]"
              >
                {email}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
