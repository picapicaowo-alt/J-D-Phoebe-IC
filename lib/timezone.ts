import type { Locale } from "@/lib/locale";

const DEFAULT_TIME_ZONE = "UTC";
const FALLBACK_TIME_ZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
  "Europe/Paris",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const partFormatterCache = new Map<string, Intl.DateTimeFormat>();
const displayFormatterCache = new Map<string, Intl.DateTimeFormat>();

function localeTag(locale: Locale) {
  return locale === "zh" ? "zh-CN" : "en-US";
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatterKey(locale: string, timeZone: string, options: Intl.DateTimeFormatOptions) {
  return JSON.stringify([
    locale,
    timeZone,
    ...Object.entries(options).sort(([a], [b]) => a.localeCompare(b)),
  ]);
}

function getPartsFormatter(timeZone: string) {
  const normalized = normalizeTimeZone(timeZone);
  const cached = partFormatterCache.get(normalized);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: normalized,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  partFormatterCache.set(normalized, formatter);
  return formatter;
}

function getDisplayFormatter(locale: Locale, timeZone: string, options: Intl.DateTimeFormatOptions) {
  const normalized = normalizeTimeZone(timeZone);
  const tag = localeTag(locale);
  const key = formatterKey(tag, normalized, options);
  const cached = displayFormatterCache.get(key);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat(tag, {
    ...options,
    timeZone: normalized,
  });
  displayFormatterCache.set(key, formatter);
  return formatter;
}

function toDate(value: Date | string | number) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameLocalDate(a: ZonedDateParts | null, b: ZonedDateParts | null) {
  return !!a && !!b && a.year === b.year && a.month === b.month && a.day === b.day;
}

export function normalizeTimeZone(timeZone: string | null | undefined) {
  const candidate = String(timeZone ?? "").trim();
  if (!candidate) return DEFAULT_TIME_ZONE;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: candidate }).resolvedOptions().timeZone || candidate;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export function getSupportedTimeZones() {
  const values =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [...FALLBACK_TIME_ZONES];
  const zones = new Set<string>([DEFAULT_TIME_ZONE, ...values.map((value) => normalizeTimeZone(value))]);
  return [...zones].sort((a, b) => a.localeCompare(b));
}

export function getZonedDateParts(value: Date | string | number, timeZone: string): ZonedDateParts | null {
  const date = toDate(value);
  if (!date) return null;

  const parts = getPartsFormatter(timeZone).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(byType.get("year") ?? 0),
    month: Number(byType.get("month") ?? 0),
    day: Number(byType.get("day") ?? 0),
    hour: Number(byType.get("hour") ?? 0),
    minute: Number(byType.get("minute") ?? 0),
    second: Number(byType.get("second") ?? 0),
  };
}

export function getZonedDaySerial(value: Date | string | number, timeZone: string) {
  const parts = getZonedDateParts(value, timeZone);
  if (!parts) return null;
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86400000);
}

export function getZonedYearMonth(value: Date | string | number, timeZone: string) {
  const parts = getZonedDateParts(value, timeZone);
  if (!parts) return null;
  return { year: parts.year, month: parts.month };
}

export function formatInTimeZone(
  value: Date | string | number | null | undefined,
  opts: { locale: Locale; timeZone: string } & Intl.DateTimeFormatOptions,
) {
  if (!value) return "";
  const date = toDate(value);
  if (!date) return "";
  const { locale, timeZone, ...formatOptions } = opts;
  return getDisplayFormatter(locale, timeZone, formatOptions).format(date);
}

export function formatDateTimeRangeInTimeZone(
  start: Date | string | number | null | undefined,
  end: Date | string | number | null | undefined,
  opts: { locale: Locale; timeZone: string },
) {
  if (!start || !end) return "";
  const startDate = toDate(start);
  const endDate = toDate(end);
  if (!startDate || !endDate) return "";

  const startParts = getZonedDateParts(startDate, opts.timeZone);
  const endParts = getZonedDateParts(endDate, opts.timeZone);
  const startText = formatInTimeZone(startDate, {
    ...opts,
    dateStyle: "medium",
    timeStyle: "short",
  });

  const endText = sameLocalDate(startParts, endParts)
    ? formatInTimeZone(endDate, {
        ...opts,
        timeStyle: "short",
      })
    : formatInTimeZone(endDate, {
        ...opts,
        dateStyle: "medium",
        timeStyle: "short",
      });

  return `${startText} -> ${endText}`;
}

export function buildDatetimeLocalValue(parts: {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
}) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour ?? 0)}:${pad(parts.minute ?? 0)}`;
}

export function toDatetimeLocalValueInTimeZone(value: Date | string | number | null | undefined, timeZone: string) {
  if (!value) return "";
  const parts = getZonedDateParts(value, timeZone);
  if (!parts) return "";
  return buildDatetimeLocalValue(parts);
}

function parseDatetimeLocalParts(raw: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(raw.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }

  return { year, month, day, hour, minute };
}

export function parseDatetimeLocalInTimeZone(raw: string, timeZone: string) {
  const desired = parseDatetimeLocalParts(raw);
  if (!desired) return null;

  const normalized = normalizeTimeZone(timeZone);
  const desiredUtcMs = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute, 0, 0);
  let guessUtcMs = desiredUtcMs;

  for (let i = 0; i < 6; i += 1) {
    const actual = getZonedDateParts(new Date(guessUtcMs), normalized);
    if (!actual) return null;

    const actualUtcMs = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, 0, 0);
    const diffMs = desiredUtcMs - actualUtcMs;
    if (diffMs === 0) return new Date(guessUtcMs);
    guessUtcMs += diffMs;
  }

  const finalParts = getZonedDateParts(new Date(guessUtcMs), normalized);
  if (
    !finalParts ||
    finalParts.year !== desired.year ||
    finalParts.month !== desired.month ||
    finalParts.day !== desired.day ||
    finalParts.hour !== desired.hour ||
    finalParts.minute !== desired.minute
  ) {
    return null;
  }

  return new Date(guessUtcMs);
}

export function getMonthRangeInTimeZone(year: number, month: number, timeZone: string) {
  const start =
    parseDatetimeLocalInTimeZone(buildDatetimeLocalValue({ year, month, day: 1, hour: 0, minute: 0 }), timeZone) ??
    new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const nextStart =
    parseDatetimeLocalInTimeZone(
      buildDatetimeLocalValue({ year: nextMonth.year, month: nextMonth.month, day: 1, hour: 0, minute: 0 }),
      timeZone,
    ) ?? new Date(Date.UTC(nextMonth.year, nextMonth.month - 1, 1, 0, 0, 0, 0));

  return {
    start,
    end: new Date(nextStart.getTime() - 1),
  };
}

export function getYearRangeInTimeZone(year: number, timeZone: string) {
  const start =
    parseDatetimeLocalInTimeZone(buildDatetimeLocalValue({ year, month: 1, day: 1, hour: 0, minute: 0 }), timeZone) ??
    new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const nextStart =
    parseDatetimeLocalInTimeZone(buildDatetimeLocalValue({ year: year + 1, month: 1, day: 1, hour: 0, minute: 0 }), timeZone) ??
    new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0));

  return {
    start,
    end: new Date(nextStart.getTime() - 1),
  };
}
