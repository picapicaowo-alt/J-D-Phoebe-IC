import { createHmac, timingSafeEqual } from "node:crypto";

type PasswordResetTokenPayload = {
  uid: string;
  exp: number;
  sig: string;
};

function passwordResetSecret() {
  return process.env.PASSWORD_RESET_SECRET || process.env.OTP_SECRET || process.env.SESSION_SECRET || "dev-only-change-me-reset-secret";
}

function signPasswordResetPayload(userId: string, email: string, passwordHash: string, expiresAt: number) {
  return createHmac("sha256", passwordResetSecret())
    .update(`${userId}:${email}:${passwordHash}:${expiresAt}`, "utf8")
    .digest("base64url");
}

export function createPasswordResetToken(opts: {
  userId: string;
  email: string;
  passwordHash: string;
  expiresAt: number;
}) {
  const payload: PasswordResetTokenPayload = {
    uid: opts.userId,
    exp: opts.expiresAt,
    sig: signPasswordResetPayload(opts.userId, opts.email, opts.passwordHash, opts.expiresAt),
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function parsePasswordResetToken(token: string): PasswordResetTokenPayload | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as Partial<PasswordResetTokenPayload>;
    if (!parsed.uid || !parsed.exp || !parsed.sig) return null;
    if (typeof parsed.uid !== "string" || typeof parsed.exp !== "number" || typeof parsed.sig !== "string") return null;
    return { uid: parsed.uid, exp: parsed.exp, sig: parsed.sig };
  } catch {
    return null;
  }
}

export function verifyPasswordResetToken(opts: {
  token: string;
  userId: string;
  email: string;
  passwordHash: string;
}) {
  const payload = parsePasswordResetToken(opts.token);
  if (!payload || payload.uid !== opts.userId || payload.exp <= Date.now()) {
    return { ok: false as const };
  }

  const expected = signPasswordResetPayload(opts.userId, opts.email, opts.passwordHash, payload.exp);
  try {
    const ok = timingSafeEqual(Buffer.from(payload.sig, "utf8"), Buffer.from(expected, "utf8"));
    return ok ? { ok: true as const, expiresAt: payload.exp } : { ok: false as const };
  } catch {
    return { ok: false as const };
  }
}

export function getAppBaseUrl() {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.VERCEL_URL || "http://localhost:3000";
  return base.startsWith("http") ? base.replace(/\/$/, "") : `https://${base.replace(/\/$/, "")}`;
}
