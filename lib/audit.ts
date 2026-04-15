import type { AuditEntityType } from "@prisma/client";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";

export async function writeAudit(params: {
  actorId: string | null;
  entityType: AuditEntityType;
  entityId: string;
  action: string;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  meta?: string | null;
}) {
  const insert = async () => {
    await prisma.auditLogEntry.create({ data: params });
  };

  try {
    after(async () => {
      try {
        await insert();
      } catch (err) {
        console.error("[writeAudit]", params.entityType, params.entityId, err);
      }
    });
  } catch {
    await insert();
  }
}
