"use server";

import { compare } from "bcryptjs";
import { redirect } from "next/navigation";
import { getAppSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (!user || !user.active) {
    redirect("/login?error=invalid");
  }

  if (!user.passwordHash) {
    redirect("/login?error=sso");
  }

  const ok = await compare(password, user.passwordHash);
  if (!ok) {
    redirect("/login?error=invalid");
  }

  const session = await getAppSession();
  session.userId = user.id;
  session.isLoggedIn = true;
  await session.save();
  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    select: { companionIntroCompletedAt: true },
  });
  redirect(fresh?.companionIntroCompletedAt ? "/home" : "/onboarding/companion");
}

export async function logoutAction() {
  const session = await getAppSession();
  session.destroy();
  redirect("/login");
}
