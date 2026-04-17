import type { Locale } from "@/lib/locale";
import path from "node:path";
import * as XLSX from "xlsx";

type QuoteRow = {
  en: string;
  zh: string;
};

let cachedPool: QuoteRow[] | null = null;

function asText(v: unknown) {
  return typeof v === "string" ? v.trim() : String(v ?? "").trim();
}

function isActiveValue(v: unknown) {
  const s = asText(v).toLowerCase();
  if (!s) return true;
  return s === "yes" || s === "y" || s === "true" || s === "1";
}

function loadQuotePool(): QuoteRow[] {
  if (cachedPool) return cachedPool;
  const workbookPath = path.join(process.cwd(), "data/employee_portal_quotes_merged_bilingual.xlsx");
  const workbook = XLSX.readFile(workbookPath);
  const sheet = workbook.Sheets["Merged Quotes"] ?? workbook.Sheets[workbook.SheetNames[0] ?? ""];

  if (!sheet) {
    throw new Error(`Quote workbook has no readable sheet: ${workbookPath}`);
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const pool = rows
    .filter((row) => isActiveValue(row["Active"]))
    .map((row) => ({
      en: asText(row["Quote (EN)"]),
      zh: asText(row["Quote (ZH)"]),
    }))
    .filter((row) => row.en || row.zh);

  if (!pool.length) {
    throw new Error(`No active bilingual quotes found in workbook: ${workbookPath}`);
  }

  cachedPool = pool;
  return pool;
}

function stableIndex(seed: string, len: number) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % len;
}

/** One pep talk per user per calendar day (UTC), deterministic. */
export function companionPepTalkForDay(locale: Locale, userId: string, day = new Date()): string {
  const ymd = day.toISOString().slice(0, 10);
  const pool = loadQuotePool();
  const i = stableIndex(`${userId}:${ymd}`, pool.length);
  const row = pool[i] ?? pool[0];
  if (!row) return "";
  if (locale === "zh") return row.zh || row.en;
  return row.en || row.zh;
}
