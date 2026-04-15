export function calendarHref(opts: {
  y?: number;
  m?: number;
  create?: boolean;
  view?: "month" | "year";
  eventId?: string;
  clearEvent?: boolean;
  sourceKind?: string;
  sourceId?: string;
  defaultProjectId?: string;
  /** When creating an event, pre-fill the chosen calendar day (1–31) for start/end defaults. */
  slotDay?: number;
}) {
  const p = new URLSearchParams();
  if (opts.view === "year") {
    p.set("view", "year");
    if (opts.y != null) p.set("y", String(opts.y));
  } else if (opts.y != null && opts.m != null) {
    p.set("y", String(opts.y));
    p.set("m", String(opts.m));
  }
  if (opts.create) p.set("create", "1");
  if (opts.slotDay != null && opts.slotDay >= 1 && opts.slotDay <= 31) p.set("slotDay", String(opts.slotDay));
  if (opts.sourceId) {
    p.set("sourceKind", opts.sourceKind ?? "MANUAL");
    p.set("sourceId", opts.sourceId);
  }
  if (opts.defaultProjectId) p.set("defaultProjectId", opts.defaultProjectId);
  if (opts.clearEvent) {
    /* omit eventId */
  } else if (opts.eventId) p.set("eventId", opts.eventId);
  const q = p.toString();
  return q ? `/calendar?${q}` : "/calendar";
}

export function parseSlotDay(raw: string | undefined): number | null {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n) || n < 1 || n > 31) return null;
  return n;
}

export function slotDefaultsForDay(year: number, month: number, day: number) {
  const start = new Date(year, month - 1, day, 9, 0, 0, 0);
  const end = new Date(year, month - 1, day, 10, 0, 0, 0);
  return { start, end };
}
