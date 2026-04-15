import { createHash, randomInt, timingSafeEqual } from "node:crypto";

function otpSecret() {
  return process.env.OTP_SECRET || process.env.SESSION_SECRET || "dev-only-change-me-otp-secret";
}

export function generateStaffInviteOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashStaffInviteOtp(inviteId: string, code: string): string {
  const normalized = code.trim();
  return createHash("sha256").update(`${otpSecret()}:${inviteId}:${normalized}`, "utf8").digest("hex");
}

export function verifyStaffInviteOtp(inviteId: string, code: string, storedHash: string): boolean {
  const candidate = hashStaffInviteOtp(inviteId, code);
  try {
    return timingSafeEqual(Buffer.from(candidate, "utf8"), Buffer.from(storedHash, "utf8"));
  } catch {
    return false;
  }
}
