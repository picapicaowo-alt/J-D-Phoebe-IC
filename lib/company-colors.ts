export const COMPANY_COLOR_OPTIONS = [
  { value: "slate", label: "Grey" },
  { value: "blue", label: "Blue" },
  { value: "cyan", label: "Cyan" },
  { value: "emerald", label: "Green" },
  { value: "amber", label: "Amber" },
  { value: "orange", label: "Orange" },
  { value: "rose", label: "Rose" },
  { value: "violet", label: "Violet" },
] as const;

export type CompanyColorValue = (typeof COMPANY_COLOR_OPTIONS)[number]["value"];

const COMPANY_COLOR_LABELS = new Map(COMPANY_COLOR_OPTIONS.map((option) => [option.value, option.label] as const));

export function normalizeCompanyColor(raw: FormDataEntryValue | string | null | undefined): CompanyColorValue | null {
  const value = String(raw ?? "").trim();
  return COMPANY_COLOR_LABELS.has(value as CompanyColorValue) ? (value as CompanyColorValue) : null;
}

export function getCompanyColorLabel(color: string | null | undefined) {
  return color ? COMPANY_COLOR_LABELS.get(color as CompanyColorValue) ?? "Grey" : "Grey";
}

export function getCompanyColorChipClassName(color: string | null | undefined) {
  switch (color) {
    case "blue":
      return "border-blue-500/20 bg-blue-500/12 text-blue-800 dark:border-blue-400/30 dark:bg-blue-400/15 dark:text-blue-100";
    case "cyan":
      return "border-cyan-500/20 bg-cyan-500/12 text-cyan-800 dark:border-cyan-400/30 dark:bg-cyan-400/15 dark:text-cyan-100";
    case "emerald":
      return "border-emerald-500/20 bg-emerald-500/12 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-100";
    case "amber":
      return "border-amber-500/20 bg-amber-500/12 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/15 dark:text-amber-100";
    case "orange":
      return "border-orange-500/20 bg-orange-500/12 text-orange-900 dark:border-orange-400/30 dark:bg-orange-400/15 dark:text-orange-100";
    case "rose":
      return "border-rose-500/20 bg-rose-500/12 text-rose-900 dark:border-rose-400/30 dark:bg-rose-400/15 dark:text-rose-100";
    case "violet":
      return "border-violet-500/20 bg-violet-500/12 text-violet-900 dark:border-violet-400/30 dark:bg-violet-400/15 dark:text-violet-100";
    case "slate":
    default:
      return "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-100";
  }
}

