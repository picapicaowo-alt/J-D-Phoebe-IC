import { getCurrentUser } from "@/lib/auth";
import type { Locale } from "@/lib/locale";
import { getPermissionKeysForUser } from "@/lib/permissions";
import { t } from "@/lib/messages";
import { AppShellNav, type ShellNavDropdown, type ShellNavLink } from "@/components/app-shell-nav";

export async function AppShellPrimaryNav({ locale }: { locale: Locale }) {
  const user = await getCurrentUser();
  if (!user?.active) return null;

  const keys = await getPermissionKeysForUser(user.id, user.isSuperAdmin);

  const primaryLinks: ShellNavLink[] = [];
  if (keys.has("project.read")) {
    primaryLinks.push({ href: "/home", label: t(locale, "navHome") });
    primaryLinks.push({ href: "/messages", label: locale === "zh" ? "消息" : "Messages" });
    primaryLinks.push({ href: "/projects", label: t(locale, "navProjects") });
    primaryLinks.push({ href: "/calendar", label: t(locale, "navCalendar") });
  } else {
    primaryLinks.push({ href: "/messages", label: locale === "zh" ? "消息" : "Messages" });
  }
  if (keys.has("knowledge.read")) primaryLinks.push({ href: "/knowledge", label: t(locale, "navKnowledge") });
  if (keys.has("staff.read")) primaryLinks.push({ href: "/staff", label: t(locale, "navStaff") });
  if (keys.has("leaderboard.read")) primaryLinks.push({ href: "/leaderboard", label: t(locale, "navLeaderboards") });
  if (keys.has("lifecycle.onboarding.hub")) primaryLinks.push({ href: "/onboarding", label: t(locale, "navOnboarding") });

  const dropdowns: ShellNavDropdown[] = [];

  const orgItems: ShellNavLink[] = [];
  if (keys.has("org.group.read")) orgItems.push({ href: "/group", label: t(locale, "navGroup"), description: t(locale, "navDdGroupDesc") });
  if (keys.has("company.read")) orgItems.push({ href: "/companies", label: t(locale, "navCompanies"), description: t(locale, "navDdCompaniesDesc") });
  if (orgItems.length) dropdowns.push({ id: "org", label: t(locale, "navDropdownOrg"), items: orgItems });

  const moreItems: ShellNavLink[] = [];
  moreItems.push({ href: "/settings/profile", label: t(locale, "navMyProfile"), description: t(locale, "navDdProfileDesc") });
  if (keys.has("role.display_name.update")) moreItems.push({ href: "/settings/roles", label: t(locale, "navRoles"), description: t(locale, "navDdRolesDesc") });
  if (keys.has("permission.matrix.read")) moreItems.push({ href: "/settings/permissions", label: t(locale, "navPermissions"), description: t(locale, "navDdPermissionsDesc") });
  if (keys.has("project.read")) moreItems.push({ href: "/settings/integrations", label: t(locale, "integrationsNav"), description: t(locale, "navDdIntegrationsDesc") });
  if (keys.has("trash.read")) moreItems.push({ href: "/trash", label: t(locale, "navTrash"), description: t(locale, "navDdTrashDesc") });
  if (user.isSuperAdmin || user.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN")) {
    moreItems.push({ href: "/settings/lifecycle", label: t(locale, "navLifecycle"), description: t(locale, "navDdLifecycleDesc") });
  }
  if (moreItems.length) dropdowns.push({ id: "more", label: t(locale, "navDropdownMore"), items: moreItems });

  if (primaryLinks.length === 0 && dropdowns.length === 0) return null;

  return (
    <div className="border-t border-[hsl(var(--border))] pt-2">
      <AppShellNav primaryLinks={primaryLinks} dropdowns={dropdowns} />
    </div>
  );
}
