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
import { labelCompanyStatus } from "@/lib/labels";

export default async function GroupPage() {
  const user = (await requireUser()) as AccessUser;
  if (!(await userHasPermission(user, "org.group.read"))) redirect("/projects");

  const group = await prisma.orgGroup.findFirst({
    where: { deletedAt: null },
    include: { companies: { where: { deletedAt: null }, orderBy: { name: "asc" } } },
  });
  if (!group) {
    return <p className="text-sm text-[hsl(var(--muted))]">No organization group configured. Run database seed.</p>;
  }

  const canEdit =
    (await userHasPermission(user, "org.group.update")) && (isSuperAdmin(user) || isGroupAdmin(user, group.id));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Group overview</h1>
        <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--muted))]">
          Parent organization and sub-entities. All records use stable internal IDs; names and introductions are editable
          display fields and can be renamed without breaking assignments.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <CardTitle>Organization profile</CardTitle>
          {canEdit ? (
            <form action={updateOrgGroupAction} className="space-y-3">
              <input type="hidden" name="orgGroupId" value={group.id} />
              <div className="space-y-1">
                <label className="text-xs font-medium text-[hsl(var(--muted))]" htmlFor="name">
                  Group name
                </label>
                <Input id="name" name="name" defaultValue={group.name} required />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[hsl(var(--muted))]" htmlFor="introduction">
                  Introduction
                </label>
                <textarea
                  id="introduction"
                  name="introduction"
                  rows={6}
                  defaultValue={group.introduction ?? ""}
                  className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[hsl(var(--accent))] focus:ring-2"
                />
              </div>
              <Button type="submit">Save changes</Button>
            </form>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="text-lg font-semibold">{group.name}</div>
              <p className="whitespace-pre-wrap text-[hsl(var(--muted))]">{group.introduction ?? "—"}</p>
            </div>
          )}
        </Card>

        <Card className="space-y-3">
          <CardTitle>Companies & entities</CardTitle>
          <p className="text-xs text-[hsl(var(--muted))]">
            Each company belongs to this group. Create and manage companies from the{" "}
            <Link className="underline" href="/companies">
              company directory
            </Link>
            .
          </p>
          <ul className="space-y-2">
            {group.companies.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-sm">
                <div>
                  <Link className="font-medium hover:underline" href={`/companies/${c.id}`}>
                    {c.name}
                  </Link>
                  <div className="text-xs text-[hsl(var(--muted))]">
                    {c.companyType ?? "Type not set"} · {labelCompanyStatus(c.status)}
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
