import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canViewProject, type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { countdownPhrase, isOverdue } from "@/lib/deadlines";
import { getLocale } from "@/lib/locale";
import { t, tPriority, tProjectStatus } from "@/lib/messages";

export default async function ProjectsPage() {
  const user = (await requireUser()) as AccessUser;
  const locale = await getLocale();
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
          <h1 className="text-2xl font-semibold tracking-tight">{t(locale, "projectsTitle")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-[hsl(var(--muted))]">{t(locale, "projectsPageLead")}</p>
        </div>
        {canCreate ? (
          <Link href="/projects/new" className="text-sm font-medium text-[hsl(var(--accent))] hover:underline">
            {t(locale, "projectsNew")}
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
                {p.company.name} · {t(locale, "projectsOwnerPrefix")} {p.owner.name}
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                <span>{tProjectStatus(locale, p.status)}</span>
                <span>·</span>
                <span>{tPriority(locale, p.priority)}</span>
                <span>·</span>
                <span>
                  {t(locale, "projectsMetaRelations")}{" "}
                  {p._count.outgoingRelations + p._count.incomingRelations}
                </span>
                <span>·</span>
                <span>
                  {t(locale, "projectsMetaKnowledge")} {p._count.knowledgeAssets}
                </span>
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
                {t(locale, "projectsLinkDetail")}
              </Link>
              {canWorkflow ? (
                <Link className="text-[hsl(var(--accent))] hover:underline" href={`/projects/${p.id}/workflow`}>
                  {t(locale, "projectsLinkWorkflow")}
                </Link>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
