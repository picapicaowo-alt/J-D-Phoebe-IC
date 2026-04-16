"use server";

import { compare, hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { getAppSession, requireUser } from "@/lib/auth";
import { getEmailDeliveryMode, sendTransactionalEmail } from "@/lib/email";
import { createPasswordResetToken, getAppBaseUrl, parsePasswordResetToken, verifyPasswordResetToken } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";

type LoginCheckResult =
  | { ok: true; userId: string; redirectTo: string }
  | { ok: false; reason: "invalid" | "sso" };

async function verifyLoginCredentials(email: string, password: string): Promise<LoginCheckResult> {
  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    select: {
      id: true,
      active: true,
      passwordHash: true,
      companionIntroCompletedAt: true,
      mustChangePassword: true,
    },
  });
  if (!user || !user.active) {
    return { ok: false, reason: "invalid" };
  }

  if (!user.passwordHash) {
    return { ok: false, reason: "sso" };
  }

  const ok = await compare(password, user.passwordHash);
  if (!ok) {
    return { ok: false, reason: "invalid" };
  }

  return {
    ok: true,
    userId: user.id,
    redirectTo: user.mustChangePassword ? "/settings/change-password" : user.companionIntroCompletedAt ? "/home" : "/onboarding/companion",
  };
}

export async function loginWithPassword(emailInput: string, password: string): Promise<LoginCheckResult> {
  const email = emailInput.trim().toLowerCase();
  return verifyLoginCredentials(email, password);
}

async function persistLoginSession(userId: string) {
  const session = await getAppSession();
  session.userId = userId;
  session.isLoggedIn = true;
  await session.save();
}

export async function loginAction(formData: FormData) {
  const result = await loginWithPassword(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  if (!result.ok) {
    redirect(`/login?error=${result.reason}`);
  }

  await persistLoginSession(result.userId);
  redirect(result.redirectTo);
}

export async function logoutAction() {
  const session = await getAppSession();
  session.destroy();
  redirect("/login");
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const deliveryMode = getEmailDeliveryMode();

  if (deliveryMode === "none") {
    redirect("/forgot-password?error=email_unavailable");
  }

  const user = email
    ? await prisma.user.findFirst({
        where: { email, deletedAt: null },
        select: { id: true, email: true, active: true, passwordHash: true },
      })
    : null;

  if (user?.active && user.passwordHash) {
    const token = createPasswordResetToken({
      userId: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      expiresAt: Date.now() + 30 * 60 * 1000,
    });
    const resetUrl = `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    const subject = "Reset your password";
    const text = [
      "We received a request to reset your password.",
      "",
      `Open this link to choose a new password: ${resetUrl}`,
      "",
      "This link expires in 30 minutes. If you did not request a reset, you can ignore this email.",
    ].join("\n");

    const sent = await sendTransactionalEmail({
      to: user.email,
      subject,
      text,
      html: `<p>We received a request to reset your password.</p><p><a href="${resetUrl}">Choose a new password</a></p><p>This link expires in 30 minutes. If you did not request a reset, you can ignore this email.</p>`,
    });

    if (!sent.ok) {
      console.error(`[password-reset] failed for ${user.email}: ${sent.error}`);
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[password-reset] reset link for ${user.email}: ${resetUrl}`);
      }
      redirect("/forgot-password?error=send_failed");
    }
  }

  redirect("/forgot-password?sent=1");
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

export async function resetPasswordAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const tokenQuery = encodeURIComponent(token);

  if (!token || newPassword.length < 8 || newPassword !== confirmPassword) {
    redirect(`/reset-password?token=${tokenQuery}&error=invalid`);
  }

  const payload = parsePasswordResetToken(token);
  if (!payload) {
    redirect("/forgot-password");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.uid },
    select: { id: true, email: true, passwordHash: true, active: true },
  });
  if (!user?.active || !user.passwordHash) {
    redirect(`/reset-password?token=${tokenQuery}&error=invalid`);
  }

  const verification = verifyPasswordResetToken({
    token,
    userId: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
  });
  if (!verification.ok) {
    redirect(`/reset-password?token=${tokenQuery}&error=invalid`);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hash(newPassword, 10),
      mustChangePassword: false,
    },
  });

  const session = await getAppSession();
  session.destroy();
  redirect("/login?reset=success");
}
