import Link from "next/link";
import { redirect } from "next/navigation";
import { createCompanyAction } from "@/app/actions/company";
import { requireUser } from "@/lib/auth";
import { isGroupAdmin, isSuperAdmin, type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getLocale } from "@/lib/locale";
import { t, tCompanyStatus } from "@/lib/messages";

export default async function CompaniesPage() {
  const user = (await requireUser()) as AccessUser;
  const locale = await getLocale();
  if (!(await userHasPermission(user, "company.read"))) redirect("/projects");

  const group = await prisma.orgGroup.findFirst({ where: { deletedAt: null } });
  if (!group) return <p className="text-sm">{t(locale, "companiesNoGroup")}</p>;

  const companies = await prisma.company.findMany({
    where: { orgGroupId: group.id, deletedAt: null },
    orderBy: { name: "asc" },
    include: { _count: { select: { projects: true, memberships: true } } },
  });

  const canCreate =
    (await userHasPermission(user, "company.create")) && (isSuperAdmin(user) || isGroupAdmin(user, group.id));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t(locale, "companiesTitle")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-[hsl(var(--muted))]">{t(locale, "companiesPageLead")}</p>
        </div>
        {canCreate ? (
          <Link href="/companies/new">
            <Button type="button">{t(locale, "companiesNew")}</Button>
          </Link>
        ) : null}
      </div>

      {canCreate ? (
        <Card className="space-y-3 p-4">
          <CardTitle>{t(locale, "companiesQuickCreate")}</CardTitle>
          <form action={createCompanyAction} className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="orgGroupId" value={group.id} />
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "commonName")}</label>
              <Input name="name" required placeholder={t(locale, "companiesPlaceholderEntityName")} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "companiesTypeCategory")}</label>
              <Input name="companyType" placeholder={t(locale, "companiesTypePlaceholder")} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "commonIntroduction")}</label>
              <Input name="introduction" placeholder={t(locale, "companiesIntroShort")} />
            </div>
            <div className="md:col-span-2">
              <Button type="submit">{t(locale, "companiesCreateCompanyBtn")}</Button>
            </div>
          </form>
        </Card>
      ) : null}

      <div className="grid gap-3">
        {companies.map((c) => (
          <Card key={c.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <Link className="text-base font-semibold hover:underline" href={`/companies/${c.id}`}>
                {c.name}
              </Link>
              <div className="mt-1 text-xs text-[hsl(var(--muted))]">
                {tCompanyStatus(locale, c.status)} · {c._count.projects} {t(locale, "companiesCountProjects")} ·{" "}
                {c._count.memberships} {t(locale, "companiesCountStaffLinks")}
              </div>
            </div>
            <Link className="text-sm font-medium text-[hsl(var(--accent))] hover:underline" href={`/companies/${c.id}`}>
              {t(locale, "companiesOpen")}
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
