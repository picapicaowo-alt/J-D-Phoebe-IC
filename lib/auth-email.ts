import { sendTransactionalEmail, type SendEmailResult } from "@/lib/email";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderActionEmail(opts: {
  preheader: string;
  heading: string;
  intro: string;
  buttonLabel: string;
  actionUrl: string;
  outro: string;
  note: string;
}) {
  const buttonLabel = escapeHtml(opts.buttonLabel);
  const heading = escapeHtml(opts.heading);
  const intro = escapeHtml(opts.intro);
  const outro = escapeHtml(opts.outro);
  const note = escapeHtml(opts.note);
  const preheader = escapeHtml(opts.preheader);
  const actionUrl = escapeHtml(opts.actionUrl);

  const text = [
    opts.heading,
    "",
    opts.intro,
    "",
    `${opts.buttonLabel}: ${opts.actionUrl}`,
    "",
    opts.outro,
    "",
    opts.note,
    "DO NOT REPLY.",
  ].join("\n");

  const html = `
    <div style="margin:0;padding:24px;background:#f5f1ea;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5ded3;border-radius:16px;padding:32px;">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#7c5a2c;">J.D. Phoebe Group</p>
        <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;color:#111827;">${heading}</h1>
        <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:#374151;">${intro}</p>
        <p style="margin:0 0 24px;">
          <a
            href="${actionUrl}"
            style="display:inline-block;background:#9b6b2f;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:700;"
          >${buttonLabel}</a>
        </p>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#374151;">${outro}</p>
        <p style="margin:0 0 16px;font-size:13px;line-height:1.7;color:#6b7280;word-break:break-all;">If the button does not open, copy and paste this link into your browser:<br /><a href="${actionUrl}" style="color:#9b6b2f;">${actionUrl}</a></p>
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;line-height:1.7;color:#6b7280;">${note}</p>
          <p style="margin:8px 0 0;font-size:12px;line-height:1.7;color:#6b7280;font-weight:700;">DO NOT REPLY</p>
        </div>
      </div>
    </div>
  `;

  return { text, html };
}

export async function sendAccountSetupEmail(opts: {
  to: string;
  recipientName?: string | null;
  setupUrl: string;
  source: "register" | "staff_invite";
}): Promise<SendEmailResult> {
  const subject =
    opts.source === "staff_invite"
      ? "You have been invited to J.D. Phoebe Group"
      : "Complete your J.D. Phoebe Group account setup";
  const greeting = opts.recipientName?.trim() ? `Hi ${opts.recipientName.trim()},` : "Hello,";
  const intro =
    opts.source === "staff_invite"
      ? `${greeting} an administrator added you as a new staff member. Use the secure link below to create your password and finish your account setup.`
      : `${greeting} thanks for registering. Use the secure link below to create your password and finish setting up your account.`;
  const outro =
    opts.source === "staff_invite"
      ? "This setup link expires in 24 hours. After you finish, you can sign in and continue onboarding."
      : "This setup link expires in 24 hours. If you did not request this, you can ignore the message.";
  const note = "This mailbox is used for automated account notifications only.";
  const rendered = renderActionEmail({
    preheader: "Complete your account setup with the secure link inside.",
    heading: "Set up your account",
    intro,
    buttonLabel: "Set up account",
    actionUrl: opts.setupUrl,
    outro,
    note,
  });

  return sendTransactionalEmail({
    to: opts.to,
    subject,
    text: rendered.text,
    html: rendered.html,
  });
}

export async function sendPasswordResetEmail(opts: { to: string; resetUrl: string }): Promise<SendEmailResult> {
  const rendered = renderActionEmail({
    preheader: "Reset your password with the secure link inside.",
    heading: "Reset your password",
    intro: "We received a request to reset the password for your J.D. Phoebe Group account.",
    buttonLabel: "Reset password",
    actionUrl: opts.resetUrl,
    outro: "This reset link expires in 30 minutes. If you did not request a password reset, you can safely ignore this email.",
    note: "This mailbox is used for automated password assistance only.",
  });

  return sendTransactionalEmail({
    to: opts.to,
    subject: "Reset your password",
    text: rendered.text,
    html: rendered.html,
  });
}
