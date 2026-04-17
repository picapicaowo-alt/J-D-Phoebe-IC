import { createHmac, timingSafeEqual } from "node:crypto";

type RegisterSetupTokenPayload = {
  kind: "register";
  email: string;
  name: string;
  exp: number;
  sig: string;
};

type StaffInviteSetupTokenPayload = {
  kind: "staff_invite";
  inviteId: string;
  email: string;
  exp: number;
  sig: string;
};

type AccountSetupTokenPayloadBase =
  | Omit<RegisterSetupTokenPayload, "sig">
  | Omit<StaffInviteSetupTokenPayload, "sig">;

export type AccountSetupTokenPayload = RegisterSetupTokenPayload | StaffInviteSetupTokenPayload;

function accountSetupSecret() {
  return (
    process.env.ACCOUNT_SETUP_SECRET ||
    process.env.PASSWORD_RESET_SECRET ||
    process.env.OTP_SECRET ||
    process.env.SESSION_SECRET ||
    "dev-only-change-me-account-setup-secret"
  );
}

function signAccountSetupPayload(payload: AccountSetupTokenPayloadBase) {
  return createHmac("sha256", accountSetupSecret()).update(JSON.stringify(payload), "utf8").digest("base64url");
}

export function createAccountSetupToken(
  payload: { kind: "register"; email: string; name: string; expiresAt: number } | { kind: "staff_invite"; inviteId: string; email: string; expiresAt: number },
) {
  const base =
    payload.kind === "register"
      ? ({
          kind: "register",
          email: payload.email,
          name: payload.name,
          exp: payload.expiresAt,
        } satisfies AccountSetupTokenPayloadBase)
      : ({
          kind: "staff_invite",
          inviteId: payload.inviteId,
          email: payload.email,
          exp: payload.expiresAt,
        } satisfies AccountSetupTokenPayloadBase);

  const tokenPayload: AccountSetupTokenPayload = {
    ...base,
    sig: signAccountSetupPayload(base),
  } as AccountSetupTokenPayload;

  return Buffer.from(JSON.stringify(tokenPayload), "utf8").toString("base64url");
}

export function parseAccountSetupToken(token: string): AccountSetupTokenPayload | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as Partial<AccountSetupTokenPayload>;

    if (!parsed || typeof parsed !== "object" || typeof parsed.sig !== "string" || typeof parsed.exp !== "number") {
      return null;
    }

    if (parsed.kind === "register") {
      if (typeof parsed.email !== "string" || typeof parsed.name !== "string") return null;
      return {
        kind: "register",
        email: parsed.email,
        name: parsed.name,
        exp: parsed.exp,
        sig: parsed.sig,
      };
    }

    if (parsed.kind === "staff_invite") {
      if (typeof parsed.inviteId !== "string" || typeof parsed.email !== "string") return null;
      return {
        kind: "staff_invite",
        inviteId: parsed.inviteId,
        email: parsed.email,
        exp: parsed.exp,
        sig: parsed.sig,
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function verifyAccountSetupToken(token: string) {
  const payload = parseAccountSetupToken(token);
  if (!payload || payload.exp <= Date.now()) {
    return { ok: false as const };
  }

  const { sig, ...base } = payload;
  const expected = signAccountSetupPayload(base);

  try {
    const ok = timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expected, "utf8"));
    return ok ? { ok: true as const, payload } : { ok: false as const };
  } catch {
    return { ok: false as const };
  }
}
