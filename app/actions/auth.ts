"use server";

import { compare, hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { getAppSession, requireUser } from "@/lib/auth";
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
    select: { companionIntroCompletedAt: true, mustChangePassword: true },
  });
  if (fresh?.mustChangePassword) {
    redirect("/settings/change-password");
  }
  redirect(fresh?.companionIntroCompletedAt ? "/home" : "/onboarding/companion");
}

export async function logoutAction() {
  const session = await getAppSession();
  session.destroy();
  redirect("/login");
}

export async function changePasswordAction(formData: FormData) {
  const user = await requireUser({ skipPasswordResetGate: true });
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword.length < 8 || newPassword !== confirmPassword) {
    redirect("/settings/change-password?error=invalid");
  }

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true, companionIntroCompletedAt: true },
  });
  if (!row?.passwordHash) {
    throw new Error("Password login is not enabled for this account.");
  }
  const ok = await compare(currentPassword, row.passwordHash);
  if (!ok) {
    redirect("/settings/change-password?error=current");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hash(newPassword, 10), mustChangePassword: false },
  });

  redirect(row.companionIntroCompletedAt ? "/home" : "/onboarding/companion");
}
