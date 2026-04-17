import { NextResponse } from "next/server";
import type { AccessUser } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { deleteMessageGroup, updateMessageGroup } from "@/lib/direct-messages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    return jsonError("Unauthorized", 401);
  }

  const payload = (await request.json().catch(() => null)) as { name?: string; memberIds?: string[] } | null;
  const { id } = await params;

  try {
    const result = await updateMessageGroup(user as AccessUser, id, {
      name: String(payload?.name ?? ""),
      memberIds: Array.isArray(payload?.memberIds) ? payload!.memberIds.map((value) => String(value)) : [],
    });
    return NextResponse.json(result);
  } catch (error) {
    const text = error instanceof Error ? error.message : "Could not update the group.";
    const status = text.toLowerCase().includes("permission") ? 403 : 400;
    return jsonError(text, status);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    return jsonError("Unauthorized", 401);
  }

  const { id } = await params;

  try {
    const result = await deleteMessageGroup(user as AccessUser, id);
    return NextResponse.json(result);
  } catch (error) {
    const text = error instanceof Error ? error.message : "Could not delete the group.";
    const status = text.toLowerCase().includes("permission") ? 403 : 400;
    return jsonError(text, status);
  }
}
