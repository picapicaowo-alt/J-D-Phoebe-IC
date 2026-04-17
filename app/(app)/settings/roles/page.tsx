import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createRoleAction,
  deleteRoleAction,
  updateRoleDefinitionAction,
  updateRoleDisplayNameAction,
} from "@/app/actions/roles";
import { requireUser } from "@/lib/auth";
import { isSuperAdmin, type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ensureRbacCatalog } from "@/lib/rbac-sync";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getLocale } from "@/lib/locale";
import { t, tRbacScope } from "@/lib/messages";

const ROLE_SCOPE_OPTIONS = ["GROUP", "COMPANY", "PROJECT"] as const;

export default async function RolesSettingsPage() {
  await ensureRbacCatalog();

  const user = (await requireUser()) as AccessUser;
  const locale = await getLocale();
  if (!(await userHasPermission(user, "role.display_name.update"))) redirect("/group");

  const superadmin = isSuperAdmin(user);
  const roles = await prisma.roleDefinition.findMany({
    orderBy: [{ system: "desc" }, { key: "asc" }],
    include: {
      _count: {
        select: {
          groupMemberships: true,
          companyMemberships: true,
          projectMemberships: true,
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div className="text-xs text-[hsl(var(--muted))]">
        <Link href="/group">{t(locale, "navGroup")}</Link> / {t(locale, "navRoles")}
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t(locale, "rolesDefinitionsTitle")}</h1>
        <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--muted))]">{t(locale, "rolesDefinitionsBody")}</p>
      </div>

      {superadmin ? (
        <Card className="space-y-4 p-4">
          <div>
            <CardTitle>{t(locale, "rolesCreateTitle")}</CardTitle>
            <p className="mt-1 text-sm text-[hsl(var(--muted))]">{t(locale, "rolesCreateHint")}</p>
          </div>
          <form action={createRoleAction} className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "rolesRowKey")}</label>
              <Input name="key" placeholder="HR_COORDINATOR" required />
              <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "rolesKeyHelp")}</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "staffDisplayName")}</label>
              <Input name="displayName" placeholder="HR Coordinator" required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "rolesRowScope")}</label>
              <Select name="appliesScope" defaultValue="COMPANY">
                {ROLE_SCOPE_OPTIONS.map((scope) => (
                  <option key={scope} value={scope}>
                    {tRbacScope(locale, scope)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "rolesDescriptionLabel")}</label>
              <Input name="description" placeholder={t(locale, "commonOptional")} />
            </div>
            <div className="md:col-span-2">
              <FormSubmitButton type="submit">{t(locale, "rolesCreateBtn")}</FormSubmitButton>
            </div>
          </form>
        </Card>
      ) : null}

      <div className="grid gap-4">
        {roles.map((role) => {
          const assignmentCount =
            role._count.groupMemberships + role._count.companyMemberships + role._count.projectMemberships;
          const isLocked = role.system || assignmentCount > 0;

          return (
            <Card key={role.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[hsl(var(--muted))]">
                <span>
                  {t(locale, "rolesRowKey")}: <span className="font-mono text-[hsl(var(--foreground))]">{role.key}</span>
                </span>
                <span>
                  {t(locale, "rolesRowScope")}: {tRbacScope(locale, role.appliesScope)}
                </span>
                <span>{role.system ? t(locale, "rolesSystemRole") : t(locale, "rolesCustomRole")}</span>
                <span>{t(locale, "rolesAssignmentsCount").replace("{n}", String(assignmentCount))}</span>
              </div>

              {superadmin ? (
                <>
                  <form action={updateRoleDefinitionAction} className="grid gap-3 md:grid-cols-2">
                    <input type="hidden" name="roleId" value={role.id} />
                    {!role.system ? (
                      <>
                        {isLocked ? (
                          <>
                            <input type="hidden" name="key" value={role.key} />
                            <input type="hidden" name="appliesScope" value={role.appliesScope} />
                          </>
                        ) : null}
                        <div className="space-y-1">
                          <label className="text-xs font-medium">{t(locale, "rolesRowKey")}</label>
                          <Input name="key" defaultValue={role.key} required disabled={isLocked} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">{t(locale, "rolesRowScope")}</label>
                          <Select name="appliesScope" defaultValue={role.appliesScope} disabled={isLocked}>
                            {ROLE_SCOPE_OPTIONS.map((scope) => (
                              <option key={scope} value={scope}>
                                {tRbacScope(locale, scope)}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </>
                    ) : null}
                    <div className="space-y-1">
                      <label className="text-xs font-medium">{t(locale, "staffDisplayName")}</label>
                      <Input name="displayName" defaultValue={role.displayName} required />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">{t(locale, "rolesDescriptionLabel")}</label>
                      <Input name="description" defaultValue={role.description ?? ""} placeholder={t(locale, "commonOptional")} />
                    </div>
                    {!role.system && isLocked ? (
                      <p className="md:col-span-2 text-xs text-[hsl(var(--muted))]">{t(locale, "rolesScopeLockedHint")}</p>
                    ) : null}
                    <div className="md:col-span-2">
                      <FormSubmitButton type="submit">{t(locale, "btnSave")}</FormSubmitButton>
                    </div>
                  </form>
                  {!role.system ? (
                    assignmentCount > 0 ? (
                      <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "rolesDeleteLockedHint")}</p>
                    ) : (
                      <form action={deleteRoleAction}>
                        <input type="hidden" name="roleId" value={role.id} />
                        <FormSubmitButton type="submit" variant="secondary" className="text-rose-700">
                          {t(locale, "btnDelete")}
                        </FormSubmitButton>
                      </form>
                    )
                  ) : null}
                </>
              ) : (
                <form action={updateRoleDisplayNameAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="roleId" value={role.id} />
                  <div className="min-w-[200px] flex-1 space-y-1">
                    <label className="text-xs font-medium">{t(locale, "staffDisplayName")}</label>
                    <Input name="displayName" defaultValue={role.displayName} required />
                  </div>
                  <FormSubmitButton type="submit">{t(locale, "btnSave")}</FormSubmitButton>
                </form>
              )}

              {role.description ? <p className="text-xs text-[hsl(var(--muted))]">{role.description}</p> : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
