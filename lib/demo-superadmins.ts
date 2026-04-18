export const DEMO_SUPERADMIN_EMAILS = [
  "admin@jdphoebe.local",
  "admin2@jdphoebe.local",
  "admin3@jdphoebe.local",
] as const;

export function isDemoSuperadminEmail(email: string) {
  return DEMO_SUPERADMIN_EMAILS.includes(email.toLowerCase() as (typeof DEMO_SUPERADMIN_EMAILS)[number]);
}
