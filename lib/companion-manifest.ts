import { readFileSync } from "fs";
import path from "path";
import type { CompanionSpecies } from "@prisma/client";

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
  const p = path.join(process.cwd(), "public/companions/manifest.json");
  cached = JSON.parse(readFileSync(p, "utf-8")) as CompanionManifestEntry[];
  return cached;
}

export function companionDisplayName(species: CompanionSpecies, locale: "en" | "zh") {
  const row = getCompanionManifest().find((e) => e.species === species);
  if (!row) return species;
  return locale === "zh" ? row.name_zh : row.name_en;
}
