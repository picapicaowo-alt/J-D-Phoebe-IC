import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMessagingUnreadCount } from "@/lib/direct-messages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = await getMessagingUnreadCount(user.id);
  return NextResponse.json({ count });
}
