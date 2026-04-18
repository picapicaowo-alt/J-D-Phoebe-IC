export const COMPANY_COLOR_OPTIONS = [
  { value: "slate", label: "Grey", hex: "#71717a" },
  { value: "blue", label: "Blue", hex: "#3b82f6" },
  { value: "cyan", label: "Cyan", hex: "#06b6d4" },
  { value: "emerald", label: "Green", hex: "#10b981" },
  { value: "amber", label: "Amber", hex: "#f59e0b" },
  { value: "orange", label: "Orange", hex: "#f97316" },
  { value: "rose", label: "Rose", hex: "#f43f5e" },
  { value: "violet", label: "Violet", hex: "#8b5cf6" },
] as const;

export type CompanyColorValue = (typeof COMPANY_COLOR_OPTIONS)[number]["value"];

const COMPANY_COLOR_LABELS = new Map(COMPANY_COLOR_OPTIONS.map((option) => [option.value, option.label] as const));
const COMPANY_COLOR_HEX = new Map(COMPANY_COLOR_OPTIONS.map((option) => [option.value, option.hex] as const));
const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function normalizeHexColor(value: string | null | undefined): string | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (!HEX_COLOR_RE.test(v)) return null;
  if (v.length === 4) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return v;
}

function hexToRgb(hex: string) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return { r, g, b };
}

export function normalizeCompanyColor(raw: FormDataEntryValue | string | null | undefined): string | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (COMPANY_COLOR_LABELS.has(value as CompanyColorValue)) return value as CompanyColorValue;
  return normalizeHexColor(value);
}

export function getCompanyColorLabel(color: string | null | undefined) {
  if (!color) return "Grey";
  const known = COMPANY_COLOR_LABELS.get(color as CompanyColorValue);
  if (known) return known;
  const hex = normalizeHexColor(color);
  if (hex) return `Custom (${hex.toUpperCase()})`;
  return "Grey";
}

export function getCompanyColorInputValue(color: string | null | undefined) {
  const hex = normalizeHexColor(color);
  if (hex) return hex;
  if (color && COMPANY_COLOR_HEX.has(color as CompanyColorValue)) {
    return COMPANY_COLOR_HEX.get(color as CompanyColorValue)!;
  }
  return COMPANY_COLOR_HEX.get("slate")!;
}

export function getCompanyColorChipClassName(color: string | null | undefined) {
  if (normalizeHexColor(color)) {
    return "border-transparent";
  }
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

export function getCompanyColorChipStyle(color: string | null | undefined) {
  const rgb = color ? hexToRgb(color) : null;
  if (!rgb) return undefined;
  return {
    borderColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.45)`,
    backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`,
    color: "rgb(39 39 42)",
  };
}
