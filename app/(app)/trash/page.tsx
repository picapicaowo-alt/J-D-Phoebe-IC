import Link from "next/link";
import { redirect } from "next/navigation";
import {
  purgeCompanyAction,
  purgeProjectAction,
  purgeUserAction,
  restoreCompanyTrashAction,
  restoreProjectTrashAction,
  restoreUserAction,
} from "@/app/actions/trash";
import { requireUser } from "@/lib/auth";
import type { AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

export default async function TrashPage() {
  const user = (await requireUser()) as AccessUser;
  if (!(await userHasPermission(user, "trash.read"))) redirect("/group");

  const canRestore = await userHasPermission(user, "trash.restore");
  const canPurge = await userHasPermission(user, "trash.purge");

  const [deletedUsers, deletedCompanies, deletedProjects] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.company.findMany({
      where: { deletedAt: { not: null } },
      include: { orgGroup: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.project.findMany({
      where: { deletedAt: { not: null } },
      include: { company: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div className="text-xs text-[hsl(var(--muted))]">
        <Link href="/group">Group</Link> / Trash
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trash</h1>
        <p className="mt-2 max-w-2xl text-sm text-[hsl(var(--muted))]">
          Soft-deleted users, companies, and projects. Restore returns them to the app; purge permanently removes records
          (where your role allows it).
        </p>
      </div>

      <Card className="space-y-3 p-4">
        <CardTitle>Users</CardTitle>
        {deletedUsers.length ? (
          <ul className="space-y-2 text-sm">
            {deletedUsers.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[hsl(var(--border))] px-3 py-2">
                <div>
                  <span className="font-medium">{u.name}</span>
                  <span className="ml-2 text-xs text-[hsl(var(--muted))]">{u.email}</span>
                </div>
                <div className="flex gap-2">
                  {canRestore ? (
                    <form action={restoreUserAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <Button type="submit" className="h-8 px-2 text-xs" variant="secondary">
                        Restore
                      </Button>
                    </form>
                  ) : null}
                  {canPurge ? (
                    <form action={purgeUserAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <Button
                        type="submit"
                        className="h-8 border border-rose-600/40 bg-rose-600/10 px-2 text-xs text-rose-800 dark:text-rose-100"
                        variant="secondary"
                      >
                        Purge
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[hsl(var(--muted))]">No users in trash.</p>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <CardTitle>Companies</CardTitle>
        {deletedCompanies.length ? (
          <ul className="space-y-2 text-sm">
            {deletedCompanies.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[hsl(var(--border))] px-3 py-2">
                <div>
                  <span className="font-medium">{c.name}</span>
                  <span className="ml-2 text-xs text-[hsl(var(--muted))]">{c.orgGroup.name}</span>
                </div>
                <div className="flex gap-2">
                  {canRestore ? (
                    <form action={restoreCompanyTrashAction}>
                      <input type="hidden" name="companyId" value={c.id} />
                      <Button type="submit" className="h-8 px-2 text-xs" variant="secondary">
                        Restore
                      </Button>
                    </form>
                  ) : null}
                  {canPurge ? (
                    <form action={purgeCompanyAction}>
                      <input type="hidden" name="companyId" value={c.id} />
                      <Button
                        type="submit"
                        className="h-8 border border-rose-600/40 bg-rose-600/10 px-2 text-xs text-rose-800 dark:text-rose-100"
                        variant="secondary"
                      >
                        Purge
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[hsl(var(--muted))]">No companies in trash.</p>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <CardTitle>Projects</CardTitle>
        {deletedProjects.length ? (
          <ul className="space-y-2 text-sm">
            {deletedProjects.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[hsl(var(--border))] px-3 py-2">
                <div>
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-2 text-xs text-[hsl(var(--muted))]">{p.company.name}</span>
                </div>
                <div className="flex gap-2">
                  {canRestore ? (
                    <form action={restoreProjectTrashAction}>
                      <input type="hidden" name="projectId" value={p.id} />
                      <Button type="submit" className="h-8 px-2 text-xs" variant="secondary">
                        Restore
                      </Button>
                    </form>
                  ) : null}
                  {canPurge ? (
                    <form action={purgeProjectAction}>
                      <input type="hidden" name="projectId" value={p.id} />
                      <Button
                        type="submit"
                        className="h-8 border border-rose-600/40 bg-rose-600/10 px-2 text-xs text-rose-800 dark:text-rose-100"
                        variant="secondary"
                      >
                        Purge
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[hsl(var(--muted))]">No projects in trash.</p>
        )}
      </Card>
    </div>
  );
}
