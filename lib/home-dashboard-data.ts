import { cache } from "react";
import type { Priority, ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canViewProject, projectVisibilityWhere, type AccessUser } from "@/lib/access";

/** Single projects fetch per request; shared by priorities, execution counts, and snapshot drilldowns. */
export const getHomeDashboardVisibleProjects = cache(async function getHomeDashboardVisibleProjects(user: AccessUser) {
  const projects = await prisma.project.findMany({
    where: { deletedAt: null, status: { not: "COMPLETED" }, ...projectVisibilityWhere(user) },
    select: {
      id: true,
      name: true,
      companyId: true,
      ownerId: true,
      status: true,
      priority: true,
      deadline: true,
      progressPercent: true,
      deletedAt: true,
      company: { select: { id: true, name: true, orgGroupId: true } },
      owner: { select: { id: true, name: true } },
    },
    orderBy: [{ deadline: "asc" }, { priority: "desc" }, { updatedAt: "desc" }],
    take: 60,
  });
  const visible = projects.filter((p) => canViewProject(user, p));
  const visibleIds = visible.map((p) => p.id);
  return { visible, visibleIds };
});

export const TERMINAL_PROJECT: ProjectStatus[] = ["COMPLETED", "ARCHIVED", "CANCELLED"];

export const getHomeDashboardVisibleWorkflowNodes = cache(async function getHomeDashboardVisibleWorkflowNodes(user: AccessUser) {
  const { visibleIds } = await getHomeDashboardVisibleProjects(user);
  if (!visibleIds.length) return [];

  return prisma.workflowNode.findMany({
    where: {
      deletedAt: null,
      projectId: { in: visibleIds },
      status: { notIn: ["DONE", "SKIPPED"] },
    },
    select: {
      id: true,
      projectId: true,
      title: true,
      status: true,
      nodeType: true,
      dueAt: true,
      operationalLabels: true,
      waitingStartedAt: true,
      waitingOnExternalName: true,
      waitingDetails: true,
      approvalRequestedAt: true,
      approvalCompletedAt: true,
      nextAction: true,
      isProjectBottleneck: true,
      project: { select: { id: true, name: true } },
      assignees: { select: { user: { select: { id: true, name: true } } }, take: 1 },
      waitingOnUser: { select: { id: true, name: true } },
      approverUser: { select: { id: true, name: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
  });
});

export function projectPriorityScore(p: { deadline: Date | null; priority: Priority; status: ProjectStatus }, nowMs: number): number {
  if (TERMINAL_PROJECT.includes(p.status)) return -1e18;
  const dl = p.deadline ? new Date(p.deadline).getTime() : Number.POSITIVE_INFINITY;
  const overdue = dl < nowMs;
  const priW = p.priority === "URGENT" ? 4 : p.priority === "HIGH" ? 3 : p.priority === "MEDIUM" ? 2 : 1;
  let s = priW * 1e18;
  if (overdue) s += 1e16;
  if (p.status === "AT_RISK") s += 1e15;
  if (Number.isFinite(dl)) s += 1e14 - dl / 100_000;
  return s;
}
