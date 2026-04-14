import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default async function StaffDirectoryPage() {
  const user = (await requireUser()) as AccessUser;
  if (!(await userHasPermission(user, "staff.read"))) redirect("/projects");

  const canCreate =
    (await userHasPermission(user, "staff.create")) &&
    (user.isSuperAdmin || user.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN"));

  const staff = await prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    include: {
      companyMemberships: { include: { company: true, roleDefinition: true } },
      projectMemberships: { include: { project: true, roleDefinition: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Staff directory</h1>
          <p className="mt-2 max-w-2xl text-sm text-[hsl(var(--muted))]">
            Identity is keyed by stable user IDs. Names and emails can be edited from each profile without breaking
            assignments.
          </p>
        </div>
        {canCreate ? (
          <Link href="/staff/new">
            <Button type="button">Add member</Button>
          </Link>
        ) : null}
      </div>

      <div className="grid gap-3">
        {staff.map((s) => (
          <Card key={s.id} className="flex flex-wrap items-start justify-between gap-4 p-4">
            <div>
              <Link className="text-base font-semibold hover:underline" href={`/staff/${s.id}`}>
                {s.name}
              </Link>
              <div className="text-xs text-[hsl(var(--muted))]">{s.email}</div>
              <div className="mt-2 text-xs text-[hsl(var(--muted))]">
                Companies:{" "}
                {s.companyMemberships.length ? s.companyMemberships.map((m) => m.company.name).join(", ") : "—"}
              </div>
            </div>
            <div className="text-xs">
              {s.active ? <span className="text-emerald-700 dark:text-emerald-300">Active</span> : <span>Inactive</span>}
              {s.isSuperAdmin ? <span className="ml-2">· Super Admin</span> : null}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
