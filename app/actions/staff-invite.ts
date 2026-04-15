"use server";

import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";
import { isSuperAdmin, type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { sendTransactionalEmail } from "@/lib/email";
import { generateStaffInviteOtpCode, hashStaffInviteOtp, verifyStaffInviteOtp } from "@/lib/otp";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const INVITE_TTL_MS = 20 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 8;

function requireString(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

export async function startStaffInviteAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "staff.create");
  if (!isSuperAdmin(actor) && !actor.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN")) {
    throw new Error("Only group-level admins can create staff accounts in this deployment.");
  }

  const email = requireString(formData, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email)) {
    throw new Error("Invalid email address");
  }
  const name = requireString(formData, "name");
  const password = requireString(formData, "password");
  const title = String(formData.get("title") ?? "").trim() || null;

  const existing = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (existing) {
    redirect("/staff/new?error=email_taken");
  }

  await prisma.staffInvite.deleteMany({
    where: { email, consumedAt: null, createdByUserId: actor.id },
  });

  const passwordHash = await hash(password, 10);
  const code = generateStaffInviteOtpCode();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const inviteId = randomUUID();
  const otpHash = hashStaffInviteOtp(inviteId, code);

  await prisma.staffInvite.create({
    data: {
      id: inviteId,
      email,
      name,
      title,
      passwordHash,
      otpHash,
      expiresAt,
      createdByUserId: actor.id,
    },
  });

  const subject = "Your verification code — staff account";
  const text = `Your verification code is: ${code}\n\nThis code expires in 20 minutes. If you did not expect this message, you can ignore it.\n\n— Do not reply to this message.`;

  const sent = await sendTransactionalEmail({ to: email, subject, text });
  if (!sent.ok && process.env.NODE_ENV !== "production") {
    console.warn(`[staff-invite] OTP for ${email} (invite ${inviteId}): ${code}`);
  }
  if (!sent.ok && sent.error === "RESEND_API_KEY is not configured.") {
    await prisma.staffInvite.delete({ where: { id: inviteId } });
    redirect("/staff/new?error=email_not_configured");
  }
  if (!sent.ok && process.env.NODE_ENV === "production") {
    await prisma.staffInvite.delete({ where: { id: inviteId } });
    redirect("/staff/new?error=email_send_failed");
  }

  revalidatePath("/staff/new");
  redirect(`/staff/new/verify?inviteId=${inviteId}`);
}

export async function confirmStaffInviteAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "staff.create");

  const inviteId = requireString(formData, "inviteId");
  const otp = String(formData.get("otp") ?? "").trim();

  const invite = await prisma.staffInvite.findFirst({
    where: { id: inviteId, consumedAt: null },
  });
  if (!invite || invite.createdByUserId !== actor.id) {
    redirect("/staff/new?error=forbidden");
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    await prisma.staffInvite.delete({ where: { id: invite.id } }).catch(() => {});
    redirect("/staff/new?error=invite_expired");
  }
  if (invite.attempts >= MAX_OTP_ATTEMPTS) {
    await prisma.staffInvite.delete({ where: { id: invite.id } }).catch(() => {});
    redirect("/staff/new?error=too_many_attempts");
  }

  const ok = verifyStaffInviteOtp(invite.id, otp, invite.otpHash);
  if (!ok) {
    await prisma.staffInvite.update({
      where: { id: invite.id },
      data: { attempts: { increment: 1 } },
    });
    redirect(`/staff/new/verify?inviteId=${invite.id}&error=bad_otp`);
  }

  const dup = await prisma.user.findFirst({ where: { email: invite.email, deletedAt: null } });
  if (dup) {
    await prisma.staffInvite.delete({ where: { id: invite.id } }).catch(() => {});
    redirect("/staff/new?error=email_taken");
  }

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email: invite.email,
        name: invite.name,
        title: invite.title,
        passwordHash: invite.passwordHash,
        active: true,
        mustChangePassword: true,
      },
    });
    await tx.staffInvite.delete({ where: { id: invite.id } });
    return u;
  });

  await writeAudit({ actorId: actor.id, entityType: "USER", entityId: user.id, action: "CREATE", newValue: user.email });
  revalidatePath("/staff");
  redirect(`/staff/${user.id}`);
}
