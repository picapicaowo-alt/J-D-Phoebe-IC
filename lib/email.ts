/**
 * Transactional email via [Resend](https://resend.com). Set RESEND_API_KEY and EMAIL_FROM in production.
 * Without RESEND_API_KEY, OTPs are logged in development only (see staff invite flow).
 */

export type SendEmailResult = { ok: true } | { ok: false; error: string };

export async function sendTransactionalEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || "Onboarding <onboarding@resend.dev>";

  if (!key) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, error: "RESEND_API_KEY is not configured." };
    }
    console.warn("[email] RESEND_API_KEY missing; skipping send to", opts.to);
    return { ok: false, error: "missing_api_key" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
      ...(opts.html ? { html: opts.html } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: body || `HTTP ${res.status}` };
  }
  return { ok: true };
}

/** Send the same lifecycle notification to multiple internal addresses (best-effort). */
export async function sendLifecycleEmail(recipients: string[], title: string, html: string): Promise<void> {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || title;
  for (const to of recipients) {
    const r = await sendTransactionalEmail({ to, subject: title, text, html });
    if (!r.ok && process.env.NODE_ENV !== "production") {
      console.warn("[email] lifecycle send skipped for", to, r.ok === false ? r.error : "");
    }
  }
}
