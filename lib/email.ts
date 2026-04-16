import nodemailer from "nodemailer";

/**
 * Transactional email via SMTP or Resend.
 *
 * Preferred: SMTP using your company mailbox
 * - SMTP_HOST
 * - SMTP_PORT
 * - SMTP_USER
 * - SMTP_PASS
 * - SMTP_SECURE (optional, "true" for implicit TLS)
 * - EMAIL_FROM
 *
 * Fallback: Resend
 * - RESEND_API_KEY
 * - EMAIL_FROM
 */

export type SendEmailResult = { ok: true } | { ok: false; error: string };

function getEmailFrom() {
  return process.env.EMAIL_FROM?.trim() || "Onboarding <onboarding@resend.dev>";
}

export function getEmailDeliveryMode() {
  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpPort = Number(process.env.SMTP_PORT ?? "");
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();

  if (smtpHost && Number.isFinite(smtpPort) && smtpPort > 0 && smtpUser && smtpPass) {
    return "smtp" as const;
  }
  if (process.env.RESEND_API_KEY?.trim()) {
    return "resend" as const;
  }
  return "none" as const;
}

export async function sendTransactionalEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<SendEmailResult> {
  const mode = getEmailDeliveryMode();
  const from = getEmailFrom();

  if (mode === "smtp") {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST!.trim(),
        port: Number(process.env.SMTP_PORT),
        secure: String(process.env.SMTP_SECURE ?? "").trim().toLowerCase() === "true" || Number(process.env.SMTP_PORT) === 465,
        auth: {
          user: process.env.SMTP_USER!.trim(),
          pass: process.env.SMTP_PASS!.trim(),
        },
      });

      await transporter.sendMail({
        from,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        ...(opts.html ? { html: opts.html } : {}),
      });
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `smtp:${message}` };
    }
  }

  if (mode === "resend") {
    const key = process.env.RESEND_API_KEY!.trim();
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

  if (process.env.NODE_ENV === "production") {
    return { ok: false, error: "No email provider configured. Set SMTP_* or RESEND_API_KEY." };
  }

  console.warn("[email] no provider configured; skipping send to", opts.to);
  return { ok: false, error: "missing_email_provider" };
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
