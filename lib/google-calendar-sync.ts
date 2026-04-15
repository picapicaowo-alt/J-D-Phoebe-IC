import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function googleOAuthRedirectUri() {
  return `${appBaseUrl()}/api/integrations/google-calendar/callback`;
}

export function buildGoogleCalendarAuthUrl(stateUserId: string) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleOAuthRedirectUri(),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    prompt: "consent",
    state: stateUserId,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleOAuthCode(code: string) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth not configured");
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, googleOAuthRedirectUri());
  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) throw new Error("No refresh token (try prompt=consent)");
  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token ?? null,
    accessTokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    scope: tokens.scope ?? null,
  };
}

export async function insertAppEventToGoogleCalendar(opts: {
  userId: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  meetUrl: string | null;
  /** When set, Google may email invites to these addresses (best-effort). */
  attendeeEmails?: string[];
}) {
  const cred = await prisma.googleCalendarCredential.findUnique({ where: { userId: opts.userId } });
  if (!cred) return null;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, googleOAuthRedirectUri());
  oauth2.setCredentials({ refresh_token: cred.refreshToken, access_token: cred.accessToken ?? undefined });
  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  const body: Record<string, unknown> = {
    summary: opts.title,
    description: [opts.description, opts.meetUrl ? `Meet: ${opts.meetUrl}` : null].filter(Boolean).join("\n\n") || undefined,
    start: { dateTime: opts.startsAt.toISOString(), timeZone: "UTC" },
    end: { dateTime: opts.endsAt.toISOString(), timeZone: "UTC" },
  };

  if (opts.attendeeEmails?.length) {
    body.attendees = opts.attendeeEmails.map((email) => ({ email }));
  }

  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: body as Record<string, unknown>,
    ...(opts.attendeeEmails?.length ? { sendUpdates: "all" as const } : {}),
  });

  return res.data.id ?? null;
}
