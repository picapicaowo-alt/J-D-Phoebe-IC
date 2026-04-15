"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

export type CalendarStaffOption = { id: string; name: string; email: string };

type Props = {
  staffOptions: CalendarStaffOption[];
  organizerUserId: string;
  labels: {
    staffTitle: string;
    staffSearch: string;
    staffHint: string;
    externalTitle: string;
    externalHint: string;
  };
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function parseExternalEmails(raw: string): string[] {
  const parts = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  return [...new Set(parts.filter((e) => EMAIL_RE.test(e)))];
}

export function CalendarEventAttendeesFields({ staffOptions, organizerUserId, labels }: Props) {
  const pickable = useMemo(
    () => staffOptions.filter((u) => u.id !== organizerUserId).sort((a, b) => a.name.localeCompare(b.name)),
    [staffOptions, organizerUserId],
  );

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [externalDraft, setExternalDraft] = useState("");

  const q = query.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!q) return pickable.filter((u) => !selectedIds.includes(u.id)).slice(0, 8);
    return pickable
      .filter((u) => !selectedIds.includes(u.id))
      .filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 12);
  }, [pickable, q, selectedIds]);

  const externalSerialized = parseExternalEmails(externalDraft).join(",");

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
        <div className="relative">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded-[6px]"
            placeholder={labels.staffSearch}
            autoComplete="off"
          />
          {query.trim() && suggestions.length ? (
            <ul
              className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-1 text-sm shadow-md"
              role="listbox"
            >
              {suggestions.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => add(u.id)}
                  >
                    <span className="font-medium text-[hsl(var(--foreground))]">{u.name}</span>
                    <span className="text-xs text-[hsl(var(--muted))]">{u.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {selectedIds.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {selectedIds.map((id) => {
              const u = staffOptions.find((x) => x.id === id);
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/15 px-2.5 py-1 text-xs text-[hsl(var(--foreground))]"
                >
                  <span className="max-w-[10rem] truncate">{u?.name ?? id}</span>
                  <button type="button" className="rounded-full px-1 text-[hsl(var(--muted))] hover:text-rose-600" onClick={() => remove(id)} aria-label="Remove">
                    ×
                  </button>
                </span>
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
        {externalSerialized ? (
          <p className="text-xs text-[hsl(var(--muted))]">
            {parseExternalEmails(externalDraft).join(" · ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
