import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import type { AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { PermissionMatrix } from "@/components/permission-matrix";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { ensureRbacCatalog } from "@/lib/rbac-sync";

export default async function PermissionsMatrixPage() {
  await ensureRbacCatalog();

  const user = (await requireUser()) as AccessUser;
  if (!(await userHasPermission(user, "permission.matrix.read"))) redirect("/group");

  const locale = await getLocale();
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
        <Link href="/group">{t(locale, "breadcrumbGroup")}</Link> / {t(locale, "breadcrumbPermissions")}
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t(locale, "permPageTitle")}</h1>
        <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--muted))]">
          {t(locale, "permMatrixLead")}
          {canEdit ? t(locale, "permPageHintEdit") : t(locale, "permPageHintReadonly")}
        </p>
      </div>

      <PermissionMatrix roles={roles} perms={perms} allowedKeys={allowedKeys} readOnly={!canEdit} locale={locale} />
    </div>
  );
}
