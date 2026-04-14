import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scanOverdueOpenNodes } from "@/lib/overdue-node-scan";

/** GET with Authorization: Bearer <CRON_SECRET> — e.g. Vercel Cron or manual curl. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 503 });
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await scanOverdueOpenNodes(prisma);
  return NextResponse.json({ ok: true, ...result });
}
