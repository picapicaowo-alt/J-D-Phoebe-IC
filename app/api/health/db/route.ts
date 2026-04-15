import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Temporary DB connectivity check for production debugging.
 * Remove or protect once Vercel + Supabase are stable.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const hasUser = await prisma.user.findFirst({ select: { id: true } });
    return NextResponse.json({
      ok: true,
      query: "SELECT 1",
      hasUserRow: Boolean(hasUser),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[health/db]", e);
    return NextResponse.json({ ok: false, message }, { status: 503 });
  }
}
