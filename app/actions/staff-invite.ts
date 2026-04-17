"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AccessUser } from "@/lib/access";
import { createAccountSetupToken } from "@/lib/account-setup";
import { requireUser } from "@/lib/auth";
import { sendAccountSetupEmail } from "@/lib/auth-email";
import { getEmailDeliveryMode } from "@/lib/email";
import { getAppBaseUrl } from "@/lib/password-reset";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canReuseUserAccount, findReusableUserCandidateByEmail } from "@/lib/user-account-reuse";
import { ensureRbacCatalog } from "@/lib/rbac-sync";

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

function requireString(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

export async function startStaffInviteAction(formData: FormData) {
  await ensureRbacCatalog();

  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "staff.create");

  const email = requireString(formData, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email)) {
    throw new Error("Invalid email address");
  }
  const name = requireString(formData, "name");
  const title = String(formData.get("title") ?? "").trim() || null;
  if (getEmailDeliveryMode() === "none") {
    redirect("/staff/new?error=email_not_configured");
  }

  const existing = await findReusableUserCandidateByEmail(email);
  if (existing && !canReuseUserAccount(existing)) {
    redirect("/staff/new?error=email_taken");
  }

  await prisma.staffInvite.deleteMany({
    where: { email, consumedAt: null, createdByUserId: actor.id },
  });

  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const inviteId = randomUUID();

  await prisma.staffInvite.create({
    data: {
      id: inviteId,
      email,
      name,
      title,
      passwordHash: "",
      otpHash: "",
      expiresAt,
      createdByUserId: actor.id,
    },
  });

  const token = createAccountSetupToken({
    kind: "staff_invite",
    inviteId,
    email,
    expiresAt: expiresAt.getTime(),
  });
  const setupUrl = `${getAppBaseUrl()}/setup-account?token=${encodeURIComponent(token)}`;

  const sent = await sendAccountSetupEmail({
    to: email,
    recipientName: name,
    setupUrl,
    source: "staff_invite",
  });
  if (!sent.ok) {
    console.error(`[staff-invite] failed to send setup email to ${email}: ${sent.error}`);
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[staff-invite] setup link for ${email} (invite ${inviteId}): ${setupUrl}`);
    }
    await prisma.staffInvite.delete({ where: { id: inviteId } });
    redirect("/staff/new?error=email_send_failed");
  }

  revalidatePath("/staff/new");
  redirect(`/staff/new?sent=1&email=${encodeURIComponent(email)}`);
}
