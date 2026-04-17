import { NextResponse } from "next/server";
import type { AccessUser } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { createMessageGroup } from "@/lib/direct-messages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    return jsonError("Unauthorized", 401);
  }

  const payload = (await request.json().catch(() => null)) as
    | { companyId?: string; name?: string; memberIds?: string[] }
    | null;

  try {
    const result = await createMessageGroup(user as AccessUser, {
      companyId: String(payload?.companyId ?? ""),
      name: String(payload?.name ?? ""),
      memberIds: Array.isArray(payload?.memberIds) ? payload!.memberIds.map((value) => String(value)) : [],
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const text = error instanceof Error ? error.message : "Could not create the group.";
    const status = text.toLowerCase().includes("permission") ? 403 : 400;
    return jsonError(text, status);
  }
}
