import type { Locale } from "@/lib/locale";

export const MBTI_OPTIONS = [
  "INTJ",
  "INTP",
  "ENTJ",
  "ENTP",
  "INFJ",
  "INFP",
  "ENFJ",
  "ENFP",
  "ISTJ",
  "ISFJ",
  "ESTJ",
  "ESFJ",
  "ISTP",
  "ISFP",
  "ESTP",
  "ESFP",
] as const;

const MBTI_SET = new Set<string>(MBTI_OPTIONS);
const MBTI_ANALYSTS = new Set(["INTJ", "INTP", "ENTJ", "ENTP"]);
const MBTI_DIPLOMATS = new Set(["INFJ", "INFP", "ENFJ", "ENFP"]);
const MBTI_SENTINELS = new Set(["ISTJ", "ISFJ", "ESTJ", "ESFJ"]);
const MBTI_EXPLORERS = new Set(["ISTP", "ISFP", "ESTP", "ESFP"]);

const ZODIAC_SIGNS = [
  { start: [1, 20], key: "aquarius", en: "Aquarius", zh: "水瓶座" },
  { start: [2, 19], key: "pisces", en: "Pisces", zh: "双鱼座" },
  { start: [3, 21], key: "aries", en: "Aries", zh: "白羊座" },
  { start: [4, 20], key: "taurus", en: "Taurus", zh: "金牛座" },
  { start: [5, 21], key: "gemini", en: "Gemini", zh: "双子座" },
  { start: [6, 22], key: "cancer", en: "Cancer", zh: "巨蟹座" },
  { start: [7, 23], key: "leo", en: "Leo", zh: "狮子座" },
  { start: [8, 23], key: "virgo", en: "Virgo", zh: "处女座" },
  { start: [9, 23], key: "libra", en: "Libra", zh: "天秤座" },
  { start: [10, 24], key: "scorpio", en: "Scorpio", zh: "天蝎座" },
  { start: [11, 23], key: "sagittarius", en: "Sagittarius", zh: "射手座" },
  { start: [12, 22], key: "capricorn", en: "Capricorn", zh: "摩羯座" },
] as const;

export function normalizeBirthday(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("Birthday must use YYYY-MM-DD");
  }

  const [year, month, day] = trimmed.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const isValid =
    parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;

  if (!isValid) throw new Error("Birthday is invalid");
  return trimmed;
}

export function normalizeMbti(value: string): string | null {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return null;
  if (!MBTI_SET.has(trimmed)) throw new Error("MBTI must be one of the 16 standard types");
  return trimmed;
}

export type MbtiBadgeTone = "neutral" | "good" | "warn" | "bad" | "info" | "violet";

export function getMbtiBadgeTone(mbti: string | null | undefined): MbtiBadgeTone {
  if (!mbti) return "neutral";
  const normalized = mbti.toUpperCase();
  if (MBTI_ANALYSTS.has(normalized)) return "violet";
  if (MBTI_DIPLOMATS.has(normalized)) return "good";
  if (MBTI_SENTINELS.has(normalized)) return "info";
  if (MBTI_EXPLORERS.has(normalized)) return "warn";
  return "neutral";
}

export function getZodiacSignLabel(birthday: string | null | undefined, locale: Locale): string | null {
  if (!birthday) return null;
  const [, monthRaw, dayRaw] = birthday.split("-");
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(month) || !Number.isInteger(day)) return null;

  let active = ZODIAC_SIGNS[ZODIAC_SIGNS.length - 1]!;
  for (const sign of ZODIAC_SIGNS) {
    const [startMonth, startDay] = sign.start;
    if (month > startMonth || (month === startMonth && day >= startDay)) active = sign;
  }

  return locale === "zh" ? active.zh : active.en;
}

export function formatBirthdayLabel(birthday: string | null | undefined, locale: Locale): string | null {
  if (!birthday) return null;
  const [yearRaw, monthRaw, dayRaw] = birthday.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (locale === "zh") return `${year}年${month}月${day}日`;
  return `${yearRaw}-${monthRaw}-${dayRaw}`;
}
