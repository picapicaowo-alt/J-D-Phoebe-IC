import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import type { AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { PermissionMatrix } from "@/components/permission-matrix";

export default async function PermissionsMatrixPage() {
  const user = (await requireUser()) as AccessUser;
  if (!(await userHasPermission(user, "permission.matrix.read"))) redirect("/group");

  const canEdit = await userHasPermission(user, "permission.matrix.update");

  const [roles, perms, links] = await Promise.all([
    prisma.roleDefinition.findMany({ orderBy: { key: "asc" } }),
    prisma.permissionDefinition.findMany({ orderBy: [{ category: "asc" }, { key: "asc" }] }),
    prisma.rolePermission.findMany({
      where: { allowed: true },
      select: { roleDefinitionId: true, permissionDefinitionId: true },
    }),
  ]);

  const allowedKeys = new Set(links.map((l) => `${l.roleDefinitionId}:${l.permissionDefinitionId}`));

  return (
    <div className="space-y-6">
      <div className="text-xs text-[hsl(var(--muted))]">
        <Link href="/group">Group</Link> / Permissions
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Permission matrix</h1>
        <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--muted))]">
          Each role accumulates permissions from group, company, and project memberships. Super admins bypass the matrix.
          {canEdit ? " Click a cell to toggle." : " You have read-only access."}
        </p>
      </div>

      <PermissionMatrix roles={roles} perms={perms} allowedKeys={allowedKeys} readOnly={!canEdit} />
    </div>
  );
}
