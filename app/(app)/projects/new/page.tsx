import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import type { AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canCreateProjectInCompanyWithRoleIds, getActorRoleIdsByPermission } from "@/lib/scoped-role-access";
import { Card, CardTitle } from "@/components/ui/card";
import { ProjectCreateForm } from "@/components/project-create-form";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  const user = (await requireUser()) as AccessUser;
  const locale = await getLocale();
  if (!(await userHasPermission(user, "project.create"))) redirect("/projects");
  const sp = await searchParams;

  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });
  const projectCreateRoleIds = (await getActorRoleIdsByPermission(user, ["project.create"])).get("project.create") ?? new Set();
  const manageable = companies.filter((c) =>
    canCreateProjectInCompanyWithRoleIds(user, { id: c.id, orgGroupId: c.orgGroupId }, projectCreateRoleIds),
  );
  if (!manageable.length) {
    return <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "projCreateNoPermission")}</p>;
  }

  const defaultCompanyId = sp.companyId && manageable.some((c) => c.id === sp.companyId) ? sp.companyId : manageable[0]!.id;
  const manageableIds = manageable.map((c) => c.id);
  const [departmentsForCreate, projectGroupsForCreate] = await Promise.all([
    prisma.department.findMany({
      where: { companyId: { in: manageableIds } },
      select: { id: true, name: true, companyId: true },
      orderBy: [{ company: { name: "asc" } }, { sortOrder: "asc" }],
    }),
    prisma.projectGroup.findMany({
      where: { companyId: { in: manageableIds } },
      select: { id: true, name: true, companyId: true },
      orderBy: [{ company: { name: "asc" } }, { sortOrder: "asc" }],
    }),
  ]);
  const staff = await prisma.user.findMany({
    where: { active: true, deletedAt: null },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  const defaultOwnerId = staff.some((member) => member.id === user.id) ? user.id : (staff[0]?.id ?? "");

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="text-xs text-[hsl(var(--muted))]">
        <Link className="hover:underline" href="/projects">
          {t(locale, "projectsTitle")}
        </Link>{" "}
        / {t(locale, "projBreadcrumbNew")}
      </div>
      <Card className="space-y-4 p-6">
        <CardTitle>{t(locale, "projCreateProjectTitle")}</CardTitle>
        <ProjectCreateForm
          locale={locale}
          defaultCompanyId={defaultCompanyId}
          defaultOwnerId={defaultOwnerId}
          companies={manageable}
          departments={departmentsForCreate}
          projectGroups={projectGroupsForCreate}
          staff={staff}
          labels={{
            company: t(locale, "commonCompany"),
            department: t(locale, "projFieldDepartment"),
            projectGroup: t(locale, "projFieldProjectGroup"),
            none: t(locale, "projDeptGroupNone"),
            projectName: t(locale, "projProjectName"),
            description: t(locale, "commonDescription"),
            ownerResponsible: t(locale, "projOwnerResponsible"),
            initialMembersHelp: t(locale, "projInitialMembersHelp"),
            ownerBecomesPmHint: t(locale, "projOwnerBecomesPmHint"),
            deadline: t(locale, "projProjectDeadlineLabel"),
            priority: t(locale, "commonPriority"),
            status: t(locale, "commonStatus"),
            submit: t(locale, "projCreateSubmit"),
          }}
        />
      </Card>
    </div>
  );
}
