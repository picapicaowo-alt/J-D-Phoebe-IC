import Link from "next/link";
import { redirect } from "next/navigation";
import { updateOrgGroupAction } from "@/app/actions/group";
import { requireUser } from "@/lib/auth";
import { isGroupAdmin, isSuperAdmin, type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getLocale } from "@/lib/locale";
import { t, tCompanyStatus } from "@/lib/messages";

export default async function GroupPage() {
  const user = (await requireUser()) as AccessUser;
  const locale = await getLocale();
  if (!(await userHasPermission(user, "org.group.read"))) redirect("/projects");

  const group = await prisma.orgGroup.findFirst({
    where: { deletedAt: null },
    include: { companies: { where: { deletedAt: null }, orderBy: { name: "asc" } } },
  });
  if (!group) {
    return <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "groupNoOrgConfigured")}</p>;
  }

  const canEdit =
    (await userHasPermission(user, "org.group.update")) && (isSuperAdmin(user) || isGroupAdmin(user, group.id));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t(locale, "groupOverviewTitle")}</h1>
        <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--muted))]">{t(locale, "groupOverviewBody")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <CardTitle>{t(locale, "groupOrgProfileCard")}</CardTitle>
          {canEdit ? (
            <form action={updateOrgGroupAction} className="space-y-3">
              <input type="hidden" name="orgGroupId" value={group.id} />
              <div className="space-y-1">
                <label className="text-xs font-medium text-[hsl(var(--muted))]" htmlFor="name">
                  {t(locale, "groupNameLabel")}
                </label>
                <Input id="name" name="name" defaultValue={group.name} required />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[hsl(var(--muted))]" htmlFor="introduction">
                  {t(locale, "groupIntroductionLabel")}
                </label>
                <textarea
                  id="introduction"
                  name="introduction"
                  rows={6}
                  defaultValue={group.introduction ?? ""}
                  className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[hsl(var(--accent))] focus:ring-2"
                />
              </div>
              <Button type="submit">{t(locale, "groupSaveChangesBtn")}</Button>
            </form>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="text-lg font-semibold">{group.name}</div>
              <p className="whitespace-pre-wrap text-[hsl(var(--muted))]">{group.introduction ?? t(locale, "staffListEmDash")}</p>
            </div>
          )}
        </Card>

        <Card className="space-y-3">
          <CardTitle>{t(locale, "groupCompaniesCard")}</CardTitle>
          <p className="text-xs text-[hsl(var(--muted))]">
            {t(locale, "groupCompaniesBodyPrefix")}{" "}
            <Link className="underline" href="/companies">
              {t(locale, "groupCompanyDirectoryLink")}
            </Link>
            {t(locale, "groupCompaniesBodySuffix")}
          </p>
          <ul className="space-y-2">
            {group.companies.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-sm">
                <div>
                  <Link className="font-medium hover:underline" href={`/companies/${c.id}`}>
                    {c.name}
                  </Link>
                  <div className="text-xs text-[hsl(var(--muted))]">
                    {c.companyType ?? t(locale, "groupTypeUnset")} · {tCompanyStatus(locale, c.status)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
