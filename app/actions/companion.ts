"use server";

import { revalidatePath } from "next/cache";
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
  const allowed = new Set(getCompanionManifest().map((e) => e.species));
  if (!allowed.has(species)) throw new Error("Invalid companion species");

  await prisma.companionProfile.upsert({
    where: { userId: actor.id },
    create: { userId: actor.id, species, name, mood: "CALM", level: 1 },
    update: { species, name },
  });
  revalidatePath("/home");
  revalidatePath(`/staff/${actor.id}`);
}
