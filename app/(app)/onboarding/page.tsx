import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createCompanyOnboardingMaterialAction,
  deleteCompanyOnboardingMaterialAction,
  updateCompanyOnboardingMaterialAction,
} from "@/app/actions/company";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { isSuperAdmin, type AccessUser } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { resolveCompanyOnboardingMaterials } from "@/lib/company-onboarding-materials";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function ymdhm(d: Date) {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export default async function OnboardingHubPage() {
  const user = (await requireUser()) as AccessUser;
  if (!(await userHasPermission(user, "lifecycle.onboarding.hub"))) redirect("/home");

  const locale = await getLocale();
  const canUpdateCompany = await userHasPermission(user, "company.update");
  const managedOrgIds = [...new Set(user.groupMemberships.filter((m) => m.roleDefinition.key === "GROUP_ADMIN").map((m) => m.orgGroupId))];
  const managedCompanyIds = [
    ...new Set(user.companyMemberships.filter((m) => m.roleDefinition.key === "COMPANY_ADMIN").map((m) => m.companyId)),
  ];
  const canManageCompanyOnboarding = canUpdateCompany && (isSuperAdmin(user) || managedOrgIds.length > 0 || managedCompanyIds.length > 0);

  const managedCompanyWhere = isSuperAdmin(user)
    ? { deletedAt: null as Date | null }
    : {
        deletedAt: null as Date | null,
        OR: [
          ...(managedOrgIds.length ? [{ orgGroupId: { in: managedOrgIds } }] : []),
          ...(managedCompanyIds.length ? [{ id: { in: managedCompanyIds } }] : []),
        ],
      };

  const [rows, managedCompanies] = await Promise.all([
    prisma.memberOnboarding.findMany({
      where: { userId: user.id },
      include: { company: true },
      orderBy: [{ completedAt: "asc" }, { deadlineAt: "asc" }],
    }),
    canManageCompanyOnboarding
      ? prisma.company.findMany({
          where: managedCompanyWhere,
          orderBy: { name: "asc" },
          include: {
            onboardingMaterials: {
              orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],
            },
            memberOnboardings: {
              where: { user: { deletedAt: null } },
              include: {
                user: {
                  select: { id: true, name: true, email: true },
                },
              },
              orderBy: [{ completedAt: "asc" }, { deadlineAt: "asc" }],
            },
          },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-container space-y-6">
      <h1 className="font-display text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">{t(locale, "navOnboarding")}</h1>
      <p className="text-sm leading-relaxed text-[hsl(var(--muted))]">{t(locale, "onboardingHubLead")}</p>

      <Card className="rounded-[12px] border border-[hsl(var(--border))] p-5">
        <CardTitle className="font-display text-base font-bold">{t(locale, "onboardingHubListTitle")}</CardTitle>
        {!rows.length ? (
          <p className="mt-3 text-sm text-[hsl(var(--muted))]">{t(locale, "onboardingHubEmpty")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-[hsl(var(--border))] text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
                <div>
                  <p className="font-medium text-[hsl(var(--foreground))]">{r.company.name}</p>
                  <p className="text-xs text-[hsl(var(--muted))]">
                    {t(locale, "onboardingDeadline")}: {ymd(r.deadlineAt)}
                    {r.completedAt ? ` · ${t(locale, "onboardingCompleted")}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {r.completedAt ? (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">{t(locale, "onboardingCompleted")}</span>
                  ) : null}
                  <Link
                    href={`/onboarding/member?companyId=${r.companyId}`}
                    className={`rounded-[6px] px-3 py-1.5 text-xs font-semibold ${
                      r.completedAt
                        ? "border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))]"
                        : "bg-[hsl(var(--primary))] text-white"
                    }`}
                  >
                    {r.completedAt ? t(locale, "onboardingHubView") : t(locale, "onboardingHubContinue")}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canManageCompanyOnboarding ? (
        <Card className="rounded-[12px] border border-[hsl(var(--border))] p-5">
          <CardTitle className="font-display text-base font-bold">{t(locale, "onboardingHubManageTitle")}</CardTitle>
          <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted))]">{t(locale, "onboardingHubManageLead")}</p>
          {!managedCompanies.length ? (
            <p className="mt-4 text-sm text-[hsl(var(--muted))]">{t(locale, "onboardingHubManageEmpty")}</p>
          ) : (
            <div className="mt-4 space-y-4">
              {managedCompanies.map((company) => {
                const materials = resolveCompanyOnboardingMaterials(company);
                return (
                  <section key={company.id} className="rounded-[12px] border border-[hsl(var(--border))] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="font-display text-lg font-bold text-[hsl(var(--foreground))]">{company.name}</h2>
                        <p className="mt-1 text-xs text-[hsl(var(--muted))]">
                          {t(locale, "onboardingHubManageAssignedCount").replace("{n}", String(company.memberOnboardings.length))}
                        </p>
                      </div>
                      <Link href={`/companies/${company.id}`} className="text-xs font-medium text-[hsl(var(--primary))] hover:underline">
                        {t(locale, "companyPreviewOpenFull")}
                      </Link>
                    </div>

                    <div className="mt-4 space-y-3">
                      {!materials.length ? (
                        <p className="rounded-[10px] border border-dashed border-[hsl(var(--border))] px-4 py-3 text-sm text-[hsl(var(--muted))]">
                          {t(locale, "onboardingHubManagePackageMissing")}
                        </p>
                      ) : (
                        materials.map((material) => (
                          <div key={material.id} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_420px]">
                            <div className="rounded-[10px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">
                                  {t(locale, "companyOnboardingTitle")}
                                </p>
                                {material.isCurrent ? (
                                  <span className="rounded-full bg-[hsl(var(--primary))]/10 px-2 py-0.5 text-[11px] font-semibold text-[hsl(var(--primary))]">
                                    {t(locale, "onboardingHubManageCurrentMaterial")}
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-3 space-y-2 text-sm">
                                <a
                                  href={material.packageUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex font-medium text-[hsl(var(--primary))] underline-offset-4 hover:underline"
                                >
                                  {t(locale, "onboardingOpenPackage")}
                                </a>
                                <p className="text-[hsl(var(--muted))]">
                                  {t(locale, "companyOnboardingVersion")}: {material.packageVersion}
                                </p>
                                <p className="text-[hsl(var(--muted))]">
                                  {t(locale, "companyOnboardingDeadlineDays")}: {material.deadlineDays}
                                </p>
                                {material.videoUrl ? (
                                  <a
                                    href={material.videoUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex font-medium text-[hsl(var(--primary))] underline-offset-4 hover:underline"
                                  >
                                    {t(locale, "onboardingVideoOpenLink")}
                                  </a>
                                ) : null}
                              </div>
                            </div>

                            <div className="rounded-[10px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
                              <form action={updateCompanyOnboardingMaterialAction} className="grid gap-3">
                                <input type="hidden" name="companyId" value={company.id} />
                                <input type="hidden" name="materialId" value={material.id} />
                                <div className="space-y-1">
                                  <label className="text-xs font-medium">{t(locale, "companyOnboardingUrl")}</label>
                                  <Input name="onboardingPackageUrl" defaultValue={material.packageUrl} placeholder="https://..." required />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-medium">{t(locale, "companyOnboardingVideoUrl")}</label>
                                  <Input name="onboardingVideoUrl" defaultValue={material.videoUrl ?? ""} placeholder="https://..." />
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="space-y-1">
                                    <label className="text-xs font-medium">{t(locale, "companyOnboardingVersion")}</label>
                                    <Input name="onboardingPackageVersion" defaultValue={material.packageVersion} />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-xs font-medium">{t(locale, "companyOnboardingDeadlineDays")}</label>
                                    <Input
                                      name="onboardingDeadlineDays"
                                      type="number"
                                      min={1}
                                      max={365}
                                      defaultValue={String(material.deadlineDays)}
                                    />
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <FormSubmitButton type="submit" variant="secondary">
                                    {t(locale, "onboardingHubManageSaveContent")}
                                  </FormSubmitButton>
                                </div>
                              </form>
                              <form action={deleteCompanyOnboardingMaterialAction} className="mt-3">
                                <input type="hidden" name="companyId" value={company.id} />
                                <input type="hidden" name="materialId" value={material.id} />
                                <FormSubmitButton
                                  type="submit"
                                  variant="secondary"
                                  className="border border-rose-600/30 bg-rose-600/5 text-rose-900 dark:text-rose-100"
                                >
                                  {t(locale, "onboardingHubManageDeleteContent")}
                                </FormSubmitButton>
                              </form>
                            </div>
                          </div>
                        ))
                      )}

                      <div className="rounded-[10px] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">
                          {t(locale, "onboardingHubManageAddContent")}
                        </p>
                        <form action={createCompanyOnboardingMaterialAction} className="mt-3 grid gap-3">
                          <input type="hidden" name="companyId" value={company.id} />
                          <div className="space-y-1">
                            <label className="text-xs font-medium">{t(locale, "companyOnboardingUrl")}</label>
                            <Input name="onboardingPackageUrl" placeholder="https://..." required />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium">{t(locale, "companyOnboardingVideoUrl")}</label>
                            <Input name="onboardingVideoUrl" placeholder="https://..." />
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <label className="text-xs font-medium">{t(locale, "companyOnboardingVersion")}</label>
                              <Input name="onboardingPackageVersion" defaultValue="v1" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium">{t(locale, "companyOnboardingDeadlineDays")}</label>
                              <Input name="onboardingDeadlineDays" type="number" min={1} max={365} defaultValue="14" />
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <FormSubmitButton type="submit">{t(locale, "onboardingHubManageAddContent")}</FormSubmitButton>
                          </div>
                        </form>
                      </div>
                    </div>

                    <div className="mt-4">
                      <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">{t(locale, "onboardingHubManageAssignments")}</h3>
                      {!company.memberOnboardings.length ? (
                        <p className="mt-2 text-sm text-[hsl(var(--muted))]">{t(locale, "onboardingHubManageAssignmentsEmpty")}</p>
                      ) : (
                        <ul className="mt-3 space-y-2">
                          {company.memberOnboardings.map((ob) => {
                            const overdue = !ob.completedAt && ob.deadlineAt.getTime() < Date.now();
                            const statusLabel = ob.completedAt
                              ? t(locale, "onboardingCompleted")
                              : overdue
                                ? t(locale, "onboardingOverdue")
                                : t(locale, "staffOnboardingPending");
                            const statusTone = ob.completedAt
                              ? "text-emerald-700 dark:text-emerald-300"
                              : overdue
                                ? "text-amber-800 dark:text-amber-200"
                                : "text-[hsl(var(--muted))]";

                            return (
                              <li key={ob.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[hsl(var(--border))] px-3 py-2 text-sm">
                                <div>
                                  <Link href={`/staff/${ob.userId}`} className="font-medium text-[hsl(var(--foreground))] hover:underline">
                                    {ob.user.name}
                                  </Link>
                                  <p className="text-xs text-[hsl(var(--muted))]">
                                    {ob.user.email} · {t(locale, "onboardingDeadline")}: {ymd(ob.deadlineAt)}
                                  </p>
                                  {isSuperAdmin(user) && ob.completedAt ? (
                                    <p className="text-xs text-[hsl(var(--muted))]">
                                      {t(locale, "onboardingCompletedAtLabel")}: {ymdhm(ob.completedAt)}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className={`text-xs font-medium ${statusTone}`}>{statusLabel}</span>
                                  <Link href={`/staff/${ob.userId}`} className="text-xs font-medium text-[hsl(var(--primary))] hover:underline">
                                    {t(locale, "staffProfile")}
                                  </Link>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
