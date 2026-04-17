import { prisma } from "@/lib/prisma";

export async function getProjectFallbackHref(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { deletedAt: true },
  });

  if (project?.deletedAt) {
    return "/projects?notice=deleted";
  }

  return "/projects?notice=missing";
}
