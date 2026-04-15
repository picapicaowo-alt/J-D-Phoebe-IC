import Link from "next/link";
import { redirect } from "next/navigation";
import { createCompanyAction } from "@/app/actions/company";
import { requireUser } from "@/lib/auth";
import { isGroupAdmin, isSuperAdmin, type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { CompaniesBrowser } from "@/components/companies-browser";

export default async function CompaniesPage() {
  const user = (await requireUser()) as AccessUser;
  const locale = await getLocale();
  if (!(await userHasPermission(user, "company.read"))) redirect("/projects");

  const group = await prisma.orgGroup.findFirst({ where: { deletedAt: null } });
  if (!group) return <p className="text-sm">{t(locale, "companiesNoGroup")}</p>;

  const companies = await prisma.company.findMany({
    where: { orgGroupId: group.id, deletedAt: null },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { projects: true, memberships: true } },
      projects: {
        where: { deletedAt: null, status: { notIn: ["COMPLETED", "ARCHIVED", "CANCELLED"] } },
        orderBy: { updatedAt: "desc" },
        take: 12,
        select: { id: true, name: true, status: true, progressPercent: true },
      },
    },
  });

  const canCreate =
    (await userHasPermission(user, "company.create")) && (isSuperAdmin(user) || isGroupAdmin(user, group.id));

  const rows = companies.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    companyType: c.companyType,
    introduction: c.introduction,
    logoUrl: c.logoUrl,
    projects: c._count.projects,
    members: c._count.memberships,
    activeProjects: c.projects,
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{t(locale, "companiesTitle")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">{t(locale, "companiesPageLead")}</p>
        </div>
        {canCreate ? (
          <Link href="/companies/new">
            <Button type="button" className="rounded-xl px-4 shadow-sm">
              + {t(locale, "companiesNew")}
            </Button>
          </Link>
        ) : null}
      </div>

      {canCreate ? (
        <Card className="space-y-3 border-zinc-200/90 p-5">
          <CardTitle>{t(locale, "companiesQuickCreate")}</CardTitle>
          <form action={createCompanyAction} className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="orgGroupId" value={group.id} />
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium text-zinc-500">{t(locale, "commonName")}</label>
              <Input name="name" required placeholder={t(locale, "companiesPlaceholderEntityName")} className="rounded-xl border-zinc-200" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">{t(locale, "companiesTypeCategory")}</label>
              <Input name="companyType" placeholder={t(locale, "companiesTypePlaceholder")} className="rounded-xl border-zinc-200" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium text-zinc-500">{t(locale, "commonIntroduction")}</label>
              <Input name="introduction" placeholder={t(locale, "companiesIntroShort")} className="rounded-xl border-zinc-200" />
            </div>
            <div className="md:col-span-2">
              <FormSubmitButton type="submit" className="rounded-xl" pendingLabel={t(locale, "companiesCreateCompanyBtn")}>
                {t(locale, "companiesCreateCompanyBtn")}
              </FormSubmitButton>
            </div>
          </form>
        </Card>
      ) : null}

      <CompaniesBrowser companies={rows} locale={locale} />
    </div>
  );
}
