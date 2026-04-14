import type { AuditEntityType } from "@prisma/client";
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
  await prisma.auditLogEntry.create({ data: params });
}
