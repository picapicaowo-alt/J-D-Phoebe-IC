import Link from "next/link";
import { notFound } from "next/navigation";
import {
  clearCompanyColorAction,
  archiveCompanyAction,
  restoreCompanyAction,
  updateCompanyColorAction,
  updateCompanyAction,
} from "@/app/actions/company";
import { softDeleteCompanyAction } from "@/app/actions/trash";
import { createDepartmentAction, deleteDepartmentAction, updateDepartmentAction } from "@/app/actions/department";
import { removeCompanyLogoAction, uploadCompanyLogoAction } from "@/app/actions/profile-media";
import { CompanyOnboardingMaterialsManager } from "@/components/company-onboarding-materials-manager";
import { requireUser } from "@/lib/auth";
import { isMissingCompanyOnboardingMaterialsTableError, resolveCompanyOnboardingMaterials } from "@/lib/company-onboarding-materials";
import { isCompanyAdmin, isGroupAdmin, isSuperAdmin, type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canCreateProjectInCompany } from "@/lib/scoped-role-access";
import { Button } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CompanyStatus } from "@prisma/client";
import { getCompanyColorInputValue, getCompanyColorLabel } from "@/lib/company-colors";
import { getLocale } from "@/lib/locale";
import { t, tCompanyStatus, tKnowledgeLayer, tProjectStatus } from "@/lib/messages";

const COMPANY_STATUSES: CompanyStatus[] = ["ACTIVE", "ARCHIVED", "SUSPENDED"];

export default async function CompanyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams?: Promise<{ uploadError?: string | string[] }>;
}) {
  const user = (await requireUser()) as AccessUser;
  const { companyId } = await params;
  const sp = (await searchParams) ?? {};
  const uploadError = Array.isArray(sp.uploadError) ? sp.uploadError[0] : sp.uploadError;

  const company = await prisma.company
    .findFirst({
      where: { id: companyId, deletedAt: null },
      include: {
        orgGroup: true,
        projects: { where: { deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 30 },
        memberships: {
          where: { user: { deletedAt: null, active: true } },
          include: { user: true, roleDefinition: true, department: true },
        },
        departments: { orderBy: { sortOrder: "asc" } },
        onboardingMaterials: {
          orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],
          include: {
            packageAttachment: { select: { id: true, fileName: true, mimeType: true } },
            videoAttachment: { select: { id: true, fileName: true, mimeType: true } },
          },
        },
      },
    })
    .catch((error) => {
      if (!isMissingCompanyOnboardingMaterialsTableError(error)) throw error;
      return prisma.company.findFirst({
        where: { id: companyId, deletedAt: null },
        include: {
          orgGroup: true,
          projects: { where: { deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 30 },
          memberships: {
            where: { user: { deletedAt: null, active: true } },
            include: { user: true, roleDefinition: true, department: true },
          },
          departments: { orderBy: { sortOrder: "asc" } },
        },
      });
    });
  if (!company) notFound();

  const knowledgeAssets = await prisma.knowledgeAsset.findMany({
    where: { deletedAt: null, project: { companyId: company.id, deletedAt: null } },
    include: { author: true, project: true },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });

  const canManage =
    isSuperAdmin(user) || isGroupAdmin(user, company.orgGroupId) || isCompanyAdmin(user, companyId);
  const canCreateProject = await canCreateProjectInCompany(user, { id: company.id, orgGroupId: company.orgGroupId });

  const canSoftDeleteCompany =
    (await userHasPermission(user, "company.soft_delete")) &&
    (isSuperAdmin(user) || isGroupAdmin(user, company.orgGroupId));

  const locale = await getLocale();
  const onboardingMaterials = resolveCompanyOnboardingMaterials(company);

  return (
    <div className="space-y-8">
      <div className="text-xs text-[hsl(var(--muted))]">
        <Link className="hover:underline" href="/group">
          {t(locale, "navGroup")}
        </Link>{" "}
        /{" "}
        <Link className="hover:underline" href="/companies">
          {t(locale, "companyBreadcrumb")}
        </Link>{" "}
        / {t(locale, "breadcrumbDetail")}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {company.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={company.logoUrl}
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 shrink-0 rounded-md border border-[hsl(var(--border))] bg-white object-contain p-1 dark:bg-zinc-900"
          />
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight">{company.name}</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted))]">
          {t(locale, "companyParentPrefix")}: {company.orgGroup.name} · {tCompanyStatus(locale, company.status)}
        </p>
      </div>

      {canManage ? (
        <Card className="space-y-4 p-4">
          <CardTitle>{t(locale, "companyEditCardTitle")}</CardTitle>
          <div className="space-y-2 border-b border-[hsl(var(--border))] pb-4">
            <p className="text-xs font-medium">{t(locale, "profileLogoLabel")}</p>
            <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "profileLogoHelp")}</p>
            {uploadError ? (
              <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-900 dark:text-rose-100">
                {uploadError}
              </p>
            ) : null}
            <form action={uploadCompanyLogoAction} encType="multipart/form-data" className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="returnTo" value={`/companies/${company.id}`} />
              <input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/gif" className="max-w-xs text-xs" />
              <FormSubmitButton type="submit" variant="secondary" className="h-9 text-xs">
                {t(locale, "btnSave")}
              </FormSubmitButton>
            </form>
            {company.logoUrl ? (
              <form action={removeCompanyLogoAction}>
                <input type="hidden" name="companyId" value={company.id} />
                <FormSubmitButton type="submit" variant="secondary" className="h-8 text-xs">
                  {t(locale, "profileLogoRemove")}
                </FormSubmitButton>
              </form>
            ) : null}
          </div>
          <form action={updateCompanyAction} className="space-y-3">
            <input type="hidden" name="companyId" value={company.id} />
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "commonName")}</label>
              <Input name="name" defaultValue={company.name} required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "companiesTypeCategory")}</label>
              <Input name="companyType" defaultValue={company.companyType ?? ""} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "companyIntroduction")}</label>
              <textarea
                name="introduction"
                rows={4}
                defaultValue={company.introduction ?? ""}
                className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "commonStatus")}</label>
              <Select name="status" defaultValue={company.status}>
                {COMPANY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {tCompanyStatus(locale, s)}
                  </option>
                ))}
              </Select>
            </div>
            <FormSubmitButton type="submit">{t(locale, "btnSave")}</FormSubmitButton>
          </form>
          <div className="space-y-2 border-t border-[hsl(var(--border))] pt-4">
            <div className="space-y-1">
              <p className="text-xs font-medium">Company color</p>
              <p className="text-xs text-[hsl(var(--muted))]">Shown on staff and project company tags. Current: {getCompanyColorLabel(company.companyColor)}</p>
            </div>
            <form action={updateCompanyColorAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="companyId" value={company.id} />
              <input
                type="color"
                name="companyColor"
                defaultValue={getCompanyColorInputValue(company.companyColor)}
                className="h-9 w-10 cursor-pointer rounded border border-[hsl(var(--border))] bg-transparent p-1"
                aria-label="Company color"
              />
              <FormSubmitButton type="submit" variant="secondary" className="h-9 text-xs">
                {t(locale, "btnSave")}
              </FormSubmitButton>
            </form>
            <form action={clearCompanyColorAction}>
              <input type="hidden" name="companyId" value={company.id} />
              <FormSubmitButton type="submit" variant="secondary" className="h-8 rounded-full text-xs">
                Default grey
              </FormSubmitButton>
            </form>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-[hsl(var(--border))] pt-4">
            {company.status !== "ARCHIVED" ? (
              <form action={archiveCompanyAction}>
                <input type="hidden" name="companyId" value={company.id} />
                <FormSubmitButton type="submit" variant="secondary">
                  {t(locale, "companyArchiveBtn")}
                </FormSubmitButton>
              </form>
            ) : (
              <form action={restoreCompanyAction}>
                <input type="hidden" name="companyId" value={company.id} />
                <FormSubmitButton type="submit" variant="secondary">
                  {t(locale, "companyRestoreActiveBtn")}
                </FormSubmitButton>
              </form>
            )}
          </div>

          {canSoftDeleteCompany ? (
            <form action={softDeleteCompanyAction} className="border-t border-[hsl(var(--border))] pt-4">
              <input type="hidden" name="companyId" value={company.id} />
              <FormSubmitButton type="submit" variant="secondary" className="border border-rose-600/30 bg-rose-600/5 text-rose-900 dark:text-rose-100">
                {t(locale, "companyMoveTrashBtn")}
              </FormSubmitButton>
            </form>
          ) : null}
        </Card>
      ) : null}

      {canManage ? (
        <Card className="space-y-4 p-4">
          <CardTitle>{t(locale, "companyOnboardingTitle")}</CardTitle>
          <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "onboardingHubManageLead")}</p>
          <CompanyOnboardingMaterialsManager companyId={company.id} locale={locale} materials={onboardingMaterials} />
        </Card>
      ) : null}

      {canManage ? (
        <Card className="space-y-4 p-4">
          <CardTitle>{t(locale, "companyDepartmentsTitle")}</CardTitle>
          <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "companyDepartmentsLead")}</p>
          <form action={createDepartmentAction} className="flex flex-wrap items-end gap-2 border-b border-[hsl(var(--border))] pb-4">
            <input type="hidden" name="companyId" value={company.id} />
            <div className="min-w-[200px] flex-1 space-y-1">
              <label className="text-xs font-medium">{t(locale, "companyDepartmentName")}</label>
              <Input name="name" required placeholder={t(locale, "companyDepartmentPlaceholder")} />
            </div>
            <FormSubmitButton type="submit" variant="secondary">
              {t(locale, "companyDepartmentAdd")}
            </FormSubmitButton>
          </form>
          <ul className="space-y-2 text-sm">
            {company.departments.map((d) => (
              <li key={d.id} className="flex flex-wrap items-end gap-2 rounded-md border border-[hsl(var(--border))] p-2">
                <form action={updateDepartmentAction} className="flex flex-1 flex-wrap items-end gap-2">
                  <input type="hidden" name="departmentId" value={d.id} />
                  <Input name="name" defaultValue={d.name} required className="min-w-[160px] flex-1 text-sm" />
                  <FormSubmitButton type="submit" variant="secondary" className="h-8 text-xs">
                    {t(locale, "btnSave")}
                  </FormSubmitButton>
                </form>
                <form action={deleteDepartmentAction}>
                  <input type="hidden" name="departmentId" value={d.id} />
                  <FormSubmitButton type="submit" variant="secondary" className="h-8 text-xs">
                    {t(locale, "btnRemove")}
                  </FormSubmitButton>
                </form>
              </li>
            ))}
            {!company.departments.length ? (
              <li className="text-xs text-[hsl(var(--muted))]">{t(locale, "companyDepartmentsEmpty")}</li>
            ) : null}
          </ul>
        </Card>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t(locale, "companySectionProjects")}</h2>
        <div className="grid gap-3">
          {company.projects.map((p) => {
            const pct = Math.max(0, Math.min(100, p.progressPercent));
            return (
              <Card key={p.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link className="font-medium hover:underline" href={`/projects/${p.id}`}>
                    {p.name}
                  </Link>
                  <span className="shrink-0 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10 px-2 py-0.5 text-xs text-[hsl(var(--muted))]">
                    {tProjectStatus(locale, p.status)}
                  </span>
                </div>
                <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "companyModalProgressLine").replace("{n}", String(pct))}</p>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[hsl(var(--muted))]/20">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
                </div>
              </Card>
            );
          })}
          {!company.projects.length ? (
            <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "companyNoProjectsYet")}</p>
          ) : null}
        </div>
        {canCreateProject ? (
          <Link href={`/projects/new?companyId=${company.id}`}>
            <Button type="button" variant="secondary">
              {t(locale, "companyNewProjectHere")}
            </Button>
          </Link>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t(locale, "companySectionStaffLinked")}</h2>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[hsl(var(--muted))]">
                <th className="py-2 pr-3">{t(locale, "commonName")}</th>
                <th className="py-2 pr-3">{t(locale, "commonEmail")}</th>
                <th className="py-2 pr-3">{t(locale, "commonRole")}</th>
                <th className="py-2">{t(locale, "projFieldDepartment")}</th>
              </tr>
            </thead>
            <tbody>
              {company.memberships.map((m) => (
                <tr key={m.id} className="border-b border-[hsl(var(--border))]">
                  <td className="py-2 pr-3">
                    <Link className="font-medium hover:underline" href={`/staff/${m.userId}`}>
                      {m.user.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-[hsl(var(--muted))]">{m.user.email}</td>
                  <td className="py-2 pr-3">{m.roleDefinition.displayName}</td>
                  <td className="py-2 text-[hsl(var(--muted))]">{m.department?.name ?? t(locale, "staffListEmDash")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t(locale, "companySectionKnowledgeCompany")}</h2>
        <div className="grid gap-2">
          {knowledgeAssets.map((k) => (
            <Card key={k.id} className="p-3">
              <div className="font-medium">{k.title}</div>
              <div className="text-xs text-[hsl(var(--muted))]">
                {k.project?.name ?? t(locale, "kbUncategorizedShort")} · {t(locale, "kbByAuthor")} {k.author.name} ·{" "}
                {tKnowledgeLayer(locale, k.layer)}
              </div>
              {k.summary ? <p className="mt-1 text-xs text-[hsl(var(--muted))]">{k.summary}</p> : null}
            </Card>
          ))}
          {!knowledgeAssets.length ? (
            <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "companyNoKnowledgeYet")}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
