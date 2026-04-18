import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Temporary DB connectivity check for production debugging.
 * Issues a `SELECT 1` against MySQL through Prisma.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const hasUser = await prisma.user.findFirst({ select: { id: true } });
    return NextResponse.json({
      ok: true,
      query: "SELECT 1",
      hasUserRow: Boolean(hasUser),
      region: process.env.VERCEL_REGION ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[health/db]", e);
    return NextResponse.json({ ok: false, message }, { status: 503 });
  }
}
