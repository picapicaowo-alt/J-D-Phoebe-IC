import { prisma } from "@/lib/prisma";

export const DEFAULT_CALENDAR_LABELS = [
  { key: "meeting", name: "Meeting", color: "#6366f1", sortOrder: 0 },
  { key: "project", name: "Project", color: "#0f766e", sortOrder: 1 },
  { key: "deadline", name: "Deadline", color: "#f97316", sortOrder: 2 },
] as const;

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
const globalForCalendarLabels = globalThis as typeof globalThis & {
  defaultCalendarLabelsPromise?: Promise<void>;
};

export function normalizeCalendarLabelColor(raw: FormDataEntryValue | string | null | undefined) {
  const value = String(raw ?? "").trim();
  return HEX_COLOR_RE.test(value) ? value.toLowerCase() : "#6366f1";
}

export async function ensureDefaultCalendarLabels() {
  if (!globalForCalendarLabels.defaultCalendarLabelsPromise) {
    globalForCalendarLabels.defaultCalendarLabelsPromise = (async () => {
      const existing = await prisma.calendarLabel.findMany({
        where: { key: { in: DEFAULT_CALENDAR_LABELS.map((label) => label.key) } },
        select: { key: true },
      });
      const existingKeys = new Set(existing.map((label) => label.key));
      const missing = DEFAULT_CALENDAR_LABELS.filter((label) => !existingKeys.has(label.key));
      if (!missing.length) return;

      await Promise.all(
        missing.map((label) =>
          prisma.calendarLabel.upsert({
            where: { key: label.key },
            create: {
              key: label.key,
              name: label.name,
              color: label.color,
              sortOrder: label.sortOrder,
              isDefault: true,
            },
            update: {},
          }),
        ),
      );
    })().catch((error) => {
      globalForCalendarLabels.defaultCalendarLabelsPromise = undefined;
      throw error;
    });
  }

  await globalForCalendarLabels.defaultCalendarLabelsPromise;
}

export async function getDefaultCalendarLabelId(key: (typeof DEFAULT_CALENDAR_LABELS)[number]["key"]) {
  const label = await prisma.calendarLabel.findUnique({
    where: { key },
    select: { id: true },
  });
  return label?.id ?? null;
}
