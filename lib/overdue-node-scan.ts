import type { PrismaClient } from "@prisma/client";
import { appendNodeOverdueOpenLedger } from "@/lib/scoring";

/** Scan open nodes past due and append idempotent overdue ledger rows (for cron or manual run). */
export async function scanOverdueOpenNodes(prisma: PrismaClient): Promise<{ checked: number; touched: number }> {
  const now = new Date();
  const nodes = await prisma.workflowNode.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ["DONE", "SKIPPED"] },
      OR: [{ dueAt: { lt: now } }, { dueAt: null, project: { deadline: { lt: now }, deletedAt: null } }],
    },
    include: {
      project: true,
      assignees: { select: { userId: true } },
    },
    take: 800,
  });

  let touched = 0;
  for (const node of nodes) {
    const effectiveDue = node.dueAt ?? node.project.deadline;
    if (!effectiveDue || effectiveDue >= now) continue;
    let userIds = node.assignees.map((a) => a.userId);
    if (!userIds.length) userIds = [node.project.ownerId];
    await appendNodeOverdueOpenLedger(prisma, {
      nodeId: node.id,
      projectId: node.projectId,
      companyId: node.project.companyId,
      userIds,
    });
    touched += 1;
  }

  return { checked: nodes.length, touched };
}
