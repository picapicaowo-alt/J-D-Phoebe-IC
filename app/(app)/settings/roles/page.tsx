import Link from "next/link";
import { updateRoleDisplayNameAction } from "@/app/actions/roles";
import { requireUser } from "@/lib/auth";
import { type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default async function RolesSettingsPage() {
  const user = (await requireUser()) as AccessUser;
  if (!(await userHasPermission(user, "role.display_name.update"))) redirect("/group");

  const roles = await prisma.roleDefinition.findMany({ orderBy: { key: "asc" } });

  return (
    <div className="space-y-6">
      <div className="text-xs text-[hsl(var(--muted))]">
        <Link href="/group">Group</Link> / Roles
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Role definitions</h1>
        <p className="mt-2 max-w-2xl text-sm text-[hsl(var(--muted))]">
          Machine keys (<code className="rounded bg-black/5 px-1">key</code>) are stable identifiers for permissions logic.
          Display names are editable and should be renamed here so the UI stays consistent everywhere.
        </p>
      </div>

      <div className="grid gap-4">
        {roles.map((r) => (
          <Card key={r.id} className="space-y-3 p-4">
            <div className="text-xs text-[hsl(var(--muted))]">
              Key: <span className="font-mono text-[hsl(var(--foreground))]">{r.key}</span> · Scope: {r.appliesScope}
            </div>
            <form action={updateRoleDisplayNameAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="roleId" value={r.id} />
              <div className="min-w-[200px] flex-1 space-y-1">
                <label className="text-xs font-medium">Display name</label>
                <Input name="displayName" defaultValue={r.displayName} required />
              </div>
              <Button type="submit">Save</Button>
            </form>
            {r.description ? <p className="text-xs text-[hsl(var(--muted))]">{r.description}</p> : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
