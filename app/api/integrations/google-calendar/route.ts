import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildGoogleCalendarAuthUrl } from "@/lib/google-calendar-sync";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = buildGoogleCalendarAuthUrl(user.id);
  if (!url) return NextResponse.json({ error: "Missing GOOGLE_OAUTH_CLIENT_ID" }, { status: 501 });
  return NextResponse.redirect(url);
}
