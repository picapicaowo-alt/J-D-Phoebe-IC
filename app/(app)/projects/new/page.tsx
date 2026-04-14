import Link from "next/link";
import { redirect } from "next/navigation";
import { createProjectAction } from "@/app/actions/project";
import { requireUser } from "@/lib/auth";
import { canManageCompanyProjects, type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getLocale } from "@/lib/locale";
import { t, tPriority, tProjectStatus } from "@/lib/messages";
import { Priority, ProjectStatus } from "@prisma/client";

const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUSES: ProjectStatus[] = ["PLANNING", "ACTIVE", "AT_RISK", "ON_HOLD"];

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  const user = (await requireUser()) as AccessUser;
  const locale = await getLocale();
  if (!(await userHasPermission(user, "project.create"))) redirect("/projects");
  const sp = await searchParams;

  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });
  const manageable = companies.filter((c) => canManageCompanyProjects(user, { id: c.id, orgGroupId: c.orgGroupId }));
  if (!manageable.length) {
    return <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "projCreateNoPermission")}</p>;
  }

  const defaultCompanyId = sp.companyId && manageable.some((c) => c.id === sp.companyId) ? sp.companyId : manageable[0]!.id;
  const staff = await prisma.user.findMany({
    where: { active: true, deletedAt: null },
    orderBy: { name: "asc" },
  });

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
        <form action={createProjectAction} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">{t(locale, "commonCompany")}</label>
            <Select name="companyId" defaultValue={defaultCompanyId} required>
              {manageable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">{t(locale, "projProjectName")}</label>
            <Input name="name" required />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">{t(locale, "commonDescription")}</label>
            <textarea name="description" rows={3} className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">{t(locale, "projOwnerResponsible")}</label>
            <Select name="ownerId" required>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">{t(locale, "projInitialMembersHelp")}</label>
            <div className="max-h-40 space-y-1 overflow-auto rounded-md border border-[hsl(var(--border))] p-2">
              {staff.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="memberIds" value={s.id} />
                  <span>{s.name}</span>
                  <span className="text-xs text-[hsl(var(--muted))]">{s.email}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "projOwnerBecomesPmHint")}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "commonPriority")}</label>
              <Select name="priority" defaultValue="MEDIUM">
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {tPriority(locale, p)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "commonStatus")}</label>
              <Select name="status" defaultValue="PLANNING">
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {tProjectStatus(locale, s)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <Button type="submit">{t(locale, "projCreateSubmit")}</Button>
        </form>
      </Card>
    </div>
  );
}
