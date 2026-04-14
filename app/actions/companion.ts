"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CompanionSpecies } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import type { AccessUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getCompanionManifest } from "@/lib/companion-manifest";

function must(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

export async function updateCompanionAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  const species = must(formData, "species") as CompanionSpecies;
  const name = String(formData.get("name") ?? "").trim() || null;
  const manifest = getCompanionManifest();
  const allowed = new Set(manifest.map((e) => e.species));
  if (!allowed.has(species)) throw new Error("Invalid companion species");
  const manifestId = manifest.find((e) => e.species === species)?.id ?? null;
  const now = new Date();

  await prisma.companionProfile.upsert({
    where: { userId: actor.id },
    create: {
      userId: actor.id,
      species,
      companionManifestId: manifestId,
      name,
      mood: "CALM",
      level: 1,
      selectedAt: now,
    },
    update: { species, companionManifestId: manifestId, name, selectedAt: now },
  });
  await prisma.user.update({
    where: { id: actor.id },
    data: { companionIntroCompletedAt: now },
  });
  revalidatePath("/home");
  revalidatePath(`/staff/${actor.id}`);
  revalidatePath("/onboarding/companion");
  const next = String(formData.get("next") ?? "").trim();
  if (next === "home") redirect("/home");
}
