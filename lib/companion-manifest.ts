import type { CompanionSpecies } from "@prisma/client";
import type { AccessUser } from "@/lib/access";
import manifestJson from "@/public/companions/manifest.json";

export type CompanionManifestEntry = {
  id: string;
  name_en: string;
  name_zh: string;
  file: string;
  species: CompanionSpecies;
};

let cached: CompanionManifestEntry[] | null = null;

export function getCompanionManifest(): CompanionManifestEntry[] {
  if (cached) return cached;
  const rows = Array.isArray(manifestJson) ? (manifestJson as CompanionManifestEntry[]) : [];
  cached = rows.filter((row) => row && typeof row.species === "string" && typeof row.file === "string");
  return cached;
}

export function companionDisplayName(species: CompanionSpecies, locale: "en" | "zh") {
  const row = getCompanionManifest().find((e) => e.species === species);
  if (!row) return species;
  return locale === "zh" ? row.name_zh : row.name_en;
}

/** During first-time selection show full pool; after onboarding, default members see a curated subset. */
export function getCompanionManifestForUser(user: AccessUser): CompanionManifestEntry[] {
  const all = getCompanionManifest();
  if (!user.companionIntroCompletedAt) return all;
  if (user.isSuperAdmin) return all;
  if (user.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN")) return all;
  if (user.companyMemberships.some((m) => ["COMPANY_ADMIN", "PROJECT_MANAGER"].includes(m.roleDefinition.key))) {
    return all;
  }
  return all.slice(0, 4);
}
