import { NextResponse } from "next/server";
import type { AccessUser } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let onboardingId = "";
  try {
    const body = (await request.json()) as { onboardingId?: string };
    onboardingId = String(body.onboardingId ?? "").trim();
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  if (!onboardingId) {
    return new NextResponse("Missing onboardingId", { status: 400 });
  }

  const ob = await prisma.memberOnboarding.findFirst({
    where: {
      id: onboardingId,
      userId: (user as AccessUser).id,
    },
    select: { id: true, materialsOpenedAt: true },
  });
  if (!ob) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (!ob.materialsOpenedAt) {
    await prisma.memberOnboarding.update({
      where: { id: onboardingId },
      data: { materialsOpenedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
