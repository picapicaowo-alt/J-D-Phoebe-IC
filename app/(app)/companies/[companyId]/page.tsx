import Link from "next/link";
import { notFound } from "next/navigation";
import { softDeleteCompanyAction } from "@/app/actions/trash";
import { archiveCompanyAction, restoreCompanyAction, updateCompanyAction } from "@/app/actions/company";
import { requireUser } from "@/lib/auth";
import { isCompanyAdmin, isGroupAdmin, isSuperAdmin, type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { labelCompanyStatus } from "@/lib/labels";
import { CompanyStatus } from "@prisma/client";

const COMPANY_STATUSES: CompanyStatus[] = ["ACTIVE", "ARCHIVED", "SUSPENDED"];

export default async function CompanyDetailPage({ params }: { params: Promise<{ companyId: string }> }) {
  const user = (await requireUser()) as AccessUser;
  const { companyId } = await params;

  const company = await prisma.company.findFirst({
    where: { id: companyId, deletedAt: null },
    include: {
      orgGroup: true,
      projects: { where: { deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 30 },
      memberships: { include: { user: true, roleDefinition: true } },
    },
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

  const canSoftDeleteCompany =
    (await userHasPermission(user, "company.soft_delete")) &&
    (isSuperAdmin(user) || isGroupAdmin(user, company.orgGroupId));

  return (
    <div className="space-y-8">
      <div className="text-xs text-[hsl(var(--muted))]">
        <Link className="hover:underline" href="/group">
          Group
        </Link>{" "}
        /{" "}
        <Link className="hover:underline" href="/companies">
          Companies
        </Link>{" "}
        / Detail
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{company.name}</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted))]">
          Parent: {company.orgGroup.name} · {labelCompanyStatus(company.status)}
        </p>
      </div>

      {canManage ? (
        <Card className="space-y-4 p-4">
          <CardTitle>Edit company</CardTitle>
          <form action={updateCompanyAction} className="space-y-3">
            <input type="hidden" name="companyId" value={company.id} />
            <div className="space-y-1">
              <label className="text-xs font-medium">Name</label>
              <Input name="name" defaultValue={company.name} required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Type / category</label>
              <Input name="companyType" defaultValue={company.companyType ?? ""} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Introduction</label>
              <textarea
                name="introduction"
                rows={4}
                defaultValue={company.introduction ?? ""}
                className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Status</label>
              <Select name="status" defaultValue={company.status}>
                {COMPANY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {labelCompanyStatus(s)}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit">Save</Button>
          </form>

          <div className="flex flex-wrap gap-2 border-t border-[hsl(var(--border))] pt-4">
            {company.status !== "ARCHIVED" ? (
              <form action={archiveCompanyAction}>
                <input type="hidden" name="companyId" value={company.id} />
                <Button type="submit" variant="secondary">
                  Archive
                </Button>
              </form>
            ) : (
              <form action={restoreCompanyAction}>
                <input type="hidden" name="companyId" value={company.id} />
                <Button type="submit" variant="secondary">
                  Restore to active
                </Button>
              </form>
            )}
          </div>

          {canSoftDeleteCompany ? (
            <form action={softDeleteCompanyAction} className="border-t border-[hsl(var(--border))] pt-4">
              <input type="hidden" name="companyId" value={company.id} />
              <Button type="submit" variant="secondary" className="border border-rose-600/30 bg-rose-600/5 text-rose-900 dark:text-rose-100">
                Move company to trash
              </Button>
            </form>
          ) : null}
        </Card>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Projects</h2>
        <div className="grid gap-2">
          {company.projects.map((p) => (
            <Card key={p.id} className="flex items-center justify-between p-3">
              <Link className="font-medium hover:underline" href={`/projects/${p.id}`}>
                {p.name}
              </Link>
              <span className="text-xs text-[hsl(var(--muted))]">{p.status}</span>
            </Card>
          ))}
          {!company.projects.length ? <p className="text-sm text-[hsl(var(--muted))]">No projects yet.</p> : null}
        </div>
        {canManage ? (
          <Link href={`/projects/new?companyId=${company.id}`}>
            <Button type="button" variant="secondary">
              New project in this company
            </Button>
          </Link>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Staff linked to this company</h2>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[hsl(var(--muted))]">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2">Role</th>
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
                  <td className="py-2">{m.roleDefinition.displayName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Knowledge produced by this company</h2>
        <div className="grid gap-2">
          {knowledgeAssets.map((k) => (
            <Card key={k.id} className="p-3">
              <div className="font-medium">{k.title}</div>
              <div className="text-xs text-[hsl(var(--muted))]">
                {k.project?.name ?? "General"} · by {k.author.name} · {k.layer}
              </div>
              {k.summary ? <p className="mt-1 text-xs text-[hsl(var(--muted))]">{k.summary}</p> : null}
            </Card>
          ))}
          {!knowledgeAssets.length ? <p className="text-sm text-[hsl(var(--muted))]">No knowledge assets yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
