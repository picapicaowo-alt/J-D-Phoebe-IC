/** Send transactional email via Resend when `RESEND_API_KEY` is set. No-op otherwise. */
export async function sendLifecycleEmail(to: string | string[], subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  if (!key) return { ok: false as const, reason: "no_resend" };

  const recipients = Array.isArray(to) ? to : [to];
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: recipients.slice(0, 10),
      subject,
      html,
    }),
  });
  if (!r.ok) {
    const text = await r.text();
    console.error("Resend error", r.status, text);
    return { ok: false as const, reason: "resend_http", status: r.status };
  }
  return { ok: true as const };
}
