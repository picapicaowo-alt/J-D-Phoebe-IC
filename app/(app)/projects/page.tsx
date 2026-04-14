import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canViewProject, type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { labelPriority, labelProjectStatus } from "@/lib/labels";
import { countdownPhrase, isOverdue } from "@/lib/deadlines";

export default async function ProjectsPage() {
  const user = (await requireUser()) as AccessUser;
  if (!(await userHasPermission(user, "project.read"))) redirect("/staff");

  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    orderBy: { updatedAt: "desc" },
    take: 80,
    include: {
      company: { include: { orgGroup: true } },
      owner: true,
      _count: { select: { outgoingRelations: true, incomingRelations: true, knowledgeAssets: true } },
    },
  });

  const visible = projects.filter((p) => canViewProject(user, { ...p, company: p.company }));
  const canWorkflow = await userHasPermission(user, "project.workflow.read");
  const canCreate = await userHasPermission(user, "project.create");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-2 max-w-2xl text-sm text-[hsl(var(--muted))]">
            Projects belong to a single company. Use the workflow view for non-linear graphs (layers, branches,
            dependencies).
          </p>
        </div>
        {canCreate ? (
          <Link href="/projects/new" className="text-sm font-medium text-[hsl(var(--accent))] hover:underline">
            New project
          </Link>
        ) : null}
      </div>

      <div className="grid gap-3">
        {visible.map((p) => (
          <Card key={p.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <Link className="text-base font-semibold hover:underline" href={`/projects/${p.id}`}>
                {p.name}
              </Link>
              <div className="text-xs text-[hsl(var(--muted))]">
                {p.company.name} · Owner {p.owner.name}
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                <span>{labelProjectStatus(p.status)}</span>
                <span>·</span>
                <span>{labelPriority(p.priority)}</span>
                <span>·</span>
                <span>
                  relations {p._count.outgoingRelations + p._count.incomingRelations}
                </span>
                <span>·</span>
                <span>knowledge {p._count.knowledgeAssets}</span>
                {p.deadline ? (
                  <>
                    <span>·</span>
                    <span className={isOverdue(p.deadline) && p.status !== "COMPLETED" ? "text-rose-600" : ""}>
                      {countdownPhrase(p.deadline)}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
            <div className="flex gap-2 text-sm">
              <Link className="text-[hsl(var(--accent))] hover:underline" href={`/projects/${p.id}`}>
                Detail
              </Link>
              {canWorkflow ? (
                <Link className="text-[hsl(var(--accent))] hover:underline" href={`/projects/${p.id}/workflow`}>
                  Workflow
                </Link>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
