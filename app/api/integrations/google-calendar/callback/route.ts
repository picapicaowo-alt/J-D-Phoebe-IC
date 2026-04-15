import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { exchangeGoogleOAuthCode } from "@/lib/google-calendar-sync";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const base = new URL("/", req.url).origin;
  if (!user) return NextResponse.redirect(new URL("/login", base));
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || state !== user.id) {
    return NextResponse.redirect(new URL("/settings/integrations?err=oauth", base));
  }
  try {
    const tokens = await exchangeGoogleOAuthCode(code);
    await prisma.googleCalendarCredential.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        refreshToken: tokens.refreshToken,
        accessToken: tokens.accessToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        scope: tokens.scope,
      },
      update: {
        refreshToken: tokens.refreshToken,
        accessToken: tokens.accessToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        scope: tokens.scope,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(new URL("/settings/integrations?err=token", base));
  }
  return NextResponse.redirect(new URL("/settings/integrations?ok=1", base));
}
