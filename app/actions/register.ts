"use server";

import { OrgGroupStatus, CompanyStatus } from "@prisma/client";
import { isClerkEnabled } from "@/lib/clerk-config";
import { createAccountSetupToken } from "@/lib/account-setup";
import { sendAccountSetupEmail } from "@/lib/auth-email";
import { getEmailDeliveryMode } from "@/lib/email";
import { getAppBaseUrl } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";
import { canReuseUserAccount, findReusableUserCandidateByEmail } from "@/lib/user-account-reuse";

export type RegisterActionResult =
  | {
      ok: boolean;
      messageKey:
        | "registerEmailTaken"
        | "registerSetupMissing"
        | "registerInvalidEmail"
        | "homeRegisterErrorGeneric"
        | "homeRegisterClerkHint"
        | "registerEmailSent"
        | "registerEmailUnavailable"
        | "registerEmailSendFailed";
    }
  | null;

const DEFAULT_REGISTER_ROLE_KEY = "COMPANY_CONTRIBUTOR";
const REGISTER_LINK_TTL_MS = 24 * 60 * 60 * 1000;

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function registerAction(formData: FormData): Promise<RegisterActionResult> {
  if (isClerkEnabled()) {
    return { ok: false, messageKey: "homeRegisterClerkHint" };
  }

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") ?? "").trim();

  if (!isValidEmail(email)) {
    return { ok: false, messageKey: "registerInvalidEmail" };
  }
  if (!name || name.length > 120) {
    return { ok: false, messageKey: "homeRegisterErrorGeneric" };
  }
  if (getEmailDeliveryMode() === "none") {
    return { ok: false, messageKey: "registerEmailUnavailable" };
  }

  const existing = await findReusableUserCandidateByEmail(email);
  const reusableExisting = canReuseUserAccount(existing) ? existing : null;
  if (existing && !reusableExisting) {
    return { ok: false, messageKey: "registerEmailTaken" };
  }

  const company = await prisma.company.findFirst({
    where: {
      deletedAt: null,
      status: CompanyStatus.ACTIVE,
      orgGroup: { deletedAt: null, status: OrgGroupStatus.ACTIVE },
    },
    orderBy: { createdAt: "asc" },
  });

  const role = await prisma.roleDefinition.findUnique({
    where: { key: DEFAULT_REGISTER_ROLE_KEY },
  });

  if (!company || !role) {
    return { ok: false, messageKey: "registerSetupMissing" };
  }

  const expiresAt = Date.now() + REGISTER_LINK_TTL_MS;
  const token = createAccountSetupToken({
    kind: "register",
    email,
    name,
    expiresAt,
  });
  const setupUrl = `${getAppBaseUrl()}/setup-account?token=${encodeURIComponent(token)}`;

  const sent = await sendAccountSetupEmail({
    to: email,
    recipientName: name,
    setupUrl,
    source: "register",
  });

  if (!sent.ok) {
    console.error(`[register] failed to send setup email to ${email}: ${sent.error}`);
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[register] setup link for ${email}: ${setupUrl}`);
    }
    return { ok: false, messageKey: "registerEmailSendFailed" };
  }

  return { ok: true, messageKey: "registerEmailSent" };
}

export async function registerFormAction(
  _prev: RegisterActionResult | null,
  formData: FormData,
): Promise<RegisterActionResult> {
  return registerAction(formData);
}
