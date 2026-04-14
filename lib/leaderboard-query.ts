import type { LeaderboardCategory, PrismaClient } from "@prisma/client";

export type LeaderboardScope = "ALL" | "COMPANY" | "PROJECT" | "ROLE";

export async function leaderboardTotals(
  prisma: PrismaClient,
  input: {
    category: LeaderboardCategory;
    periodStart: Date;
    periodEnd: Date;
    scope: LeaderboardScope;
    companyId?: string | null;
    projectId?: string | null;
    roleKey?: string | null;
  },
): Promise<{ userId: string; total: number }[]> {
  const { category, periodStart, periodEnd, scope, companyId, projectId, roleKey } = input;

  let userFilter: string[] | null = null;
  if (scope === "COMPANY" && companyId) {
    const rows = await prisma.companyMembership.findMany({ where: { companyId }, select: { userId: true } });
    userFilter = rows.map((r) => r.userId);
  } else if (scope === "PROJECT" && projectId) {
    const rows = await prisma.projectMembership.findMany({ where: { projectId }, select: { userId: true } });
    userFilter = rows.map((r) => r.userId);
  } else if (scope === "ROLE" && roleKey) {
    const roles = await prisma.roleDefinition.findMany({ where: { key: roleKey }, select: { id: true } });
    const roleIds = roles.map((r) => r.id);
    const [g, c, p] = await Promise.all([
      prisma.groupMembership.findMany({ where: { roleDefinitionId: { in: roleIds } }, select: { userId: true } }),
      prisma.companyMembership.findMany({ where: { roleDefinitionId: { in: roleIds } }, select: { userId: true } }),
      prisma.projectMembership.findMany({ where: { roleDefinitionId: { in: roleIds } }, select: { userId: true } }),
    ]);
    userFilter = [...new Set([...g, ...c, ...p].map((x) => x.userId))];
  }

  const entries = await prisma.scoreLedgerEntry.findMany({
    where: {
      leaderboardCategory: category,
      createdAt: { gte: periodStart, lt: periodEnd },
      ...(userFilter ? { userId: { in: userFilter } } : {}),
      ...(scope === "COMPANY" && companyId ? { companyId } : {}),
      ...(scope === "PROJECT" && projectId ? { projectId } : {}),
    },
    select: { userId: true, delta: true },
  });

  const map = new Map<string, number>();
  for (const e of entries) {
    map.set(e.userId, (map.get(e.userId) ?? 0) + e.delta);
  }
  return [...map.entries()]
    .map(([userId, total]) => ({ userId, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 40);
}
