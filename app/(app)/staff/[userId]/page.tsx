import Link from "next/link";
import { notFound } from "next/navigation";
import { softDeleteUserAction } from "@/app/actions/trash";
import { assignCompanyAction, assignProjectAction, updateStaffAction } from "@/app/actions/staff";
import { requireUser } from "@/lib/auth";
import { isSuperAdmin, type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AbilityRadar } from "@/components/ability-radar";
import { labelCompanionSpecies, labelRecognitionCategory } from "@/lib/labels";

export default async function StaffDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const actor = (await requireUser()) as AccessUser;
  const { userId } = await params;

  const target = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: {
      companyMemberships: { include: { company: true, roleDefinition: true } },
      projectMemberships: { include: { project: { include: { company: true } }, roleDefinition: true } },
      companionProfile: true,
      performanceSnapshots: { orderBy: { createdAt: "desc" }, take: 1 },
      recognitionsReceived: {
        include: { fromUser: true, project: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      },
    },
  });
  if (!target) notFound();

  const isAnyCompanyAdmin = actor.companyMemberships.some((m) => m.roleDefinition.key === "COMPANY_ADMIN");
  const isAnyGroupAdmin = actor.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN");
  const isAnyPm = actor.projectMemberships.some((m) => m.roleDefinition.key === "PROJECT_MANAGER");

  const canEditProfile =
    isSuperAdmin(actor) || actor.id === target.id || (await userHasPermission(actor, "staff.update"));

  const canAssignCompanyUI =
    (await userHasPermission(actor, "staff.assign_company")) &&
    (isSuperAdmin(actor) || isAnyGroupAdmin || isAnyCompanyAdmin);

  const canAssignProjectUI =
    (await userHasPermission(actor, "staff.assign_project")) &&
    (isSuperAdmin(actor) || isAnyGroupAdmin || isAnyCompanyAdmin || isAnyPm);

  const companies = await prisma.company.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    include: { company: true },
  });
  const companyRoles = await prisma.roleDefinition.findMany({
    where: { appliesScope: "COMPANY" },
    orderBy: { displayName: "asc" },
  });
  const projectRoles = await prisma.roleDefinition.findMany({
    where: { appliesScope: "PROJECT" },
  });

  const canSoftDelete =
    (await userHasPermission(actor, "staff.soft_delete")) &&
    (isSuperAdmin(actor) || isAnyGroupAdmin) &&
    actor.id !== target.id &&
    !(target.isSuperAdmin && !isSuperAdmin(actor));

  const latestScore = target.performanceSnapshots[0] ?? null;
  const radarPoints = [
    { label: "Execution", value: latestScore?.executionScore ?? 0 },
    { label: "Collab", value: latestScore?.collaborationScore ?? 0 },
    { label: "Thinking", value: Math.round(((latestScore?.executionScore ?? 0) + (latestScore?.knowledgeScore ?? 0)) / 2) },
    { label: "Creativity", value: Math.round(((latestScore?.knowledgeScore ?? 0) + (latestScore?.recognitionScore ?? 0)) / 2) },
    { label: "Knowledge", value: latestScore?.knowledgeScore ?? 0 },
    { label: "Stability", value: Math.round(((latestScore?.executionScore ?? 0) + (latestScore?.collaborationScore ?? 0)) / 2) },
    { label: "Influence", value: latestScore?.recognitionScore ?? 0 },
  ];

  return (
    <div className="space-y-8">
      <div className="text-xs text-[hsl(var(--muted))]">
        <Link className="hover:underline" href="/staff">
          Staff
        </Link>{" "}
        / Profile
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">{target.name}</h1>

      {canEditProfile ? (
        <Card className="space-y-4 p-4">
          <CardTitle>Profile</CardTitle>
          <form action={updateStaffAction} className="space-y-3">
            <input type="hidden" name="userId" value={target.id} />
            <div className="space-y-1">
              <label className="text-xs font-medium">Name</label>
              <Input name="name" defaultValue={target.name} required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Title</label>
              <Input name="title" defaultValue={target.title ?? ""} />
            </div>
            {isSuperAdmin(actor) ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={target.active} />
                Active
              </label>
            ) : null}
            <Button type="submit">Save</Button>
          </form>
        </Card>
      ) : (
        <Card className="p-4 text-sm text-[hsl(var(--muted))]">You do not have permission to edit this profile.</Card>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <CardTitle>Ability Radar</CardTitle>
          <AbilityRadar points={radarPoints} />
          {latestScore ? (
            <p className="text-xs text-[hsl(var(--muted))]">Trend delta this cycle: {latestScore.trendDelta >= 0 ? "+" : ""}{latestScore.trendDelta}</p>
          ) : (
            <p className="text-xs text-[hsl(var(--muted))]">No performance snapshot yet.</p>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <CardTitle>Companion</CardTitle>
          {target.companionProfile ? (
            <div className="space-y-1 text-sm">
              <div className="font-medium">{target.companionProfile.name ?? labelCompanionSpecies(target.companionProfile.species)}</div>
              <div className="text-xs text-[hsl(var(--muted))]">Species: {labelCompanionSpecies(target.companionProfile.species)}</div>
              <div className="text-xs text-[hsl(var(--muted))]">Mood: {target.companionProfile.mood}</div>
              <div className="text-xs text-[hsl(var(--muted))]">Level: {target.companionProfile.level}</div>
            </div>
          ) : (
            <p className="text-sm text-[hsl(var(--muted))]">No companion selected yet.</p>
          )}
        </Card>
      </section>

      <Card className="space-y-3 p-4">
        <CardTitle>Recognition received</CardTitle>
        {target.recognitionsReceived.length ? (
          <ul className="space-y-2 text-sm">
            {target.recognitionsReceived.map((r) => (
              <li key={r.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
                <div className="font-medium">{r.tagLabel}</div>
                <div className="text-xs text-[hsl(var(--muted))]">
                  {labelRecognitionCategory(r.tagCategory)} · {r.project?.name ?? "General"} · by {r.fromUser?.name ?? "A teammate"}
                </div>
                {r.message ? <p className="mt-1 text-sm">{r.message}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[hsl(var(--muted))]">No recognition yet.</p>
        )}
      </Card>

      {canAssignCompanyUI ? (
        <Card className="space-y-3 p-4">
          <CardTitle>Assign to company</CardTitle>
          <form action={assignCompanyAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="userId" value={target.id} />
            <Select name="companyId" required className="min-w-[180px]">
              <option value="">Select company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select name="roleDefinitionId" required className="min-w-[200px]">
              {companyRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.displayName}
                </option>
              ))}
            </Select>
            <Button type="submit">Assign / update</Button>
          </form>
        </Card>
      ) : null}

      {canAssignProjectUI ? (
        <Card className="space-y-3 p-4">
          <CardTitle>Assign to project</CardTitle>
          <form action={assignProjectAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="userId" value={target.id} />
            <Select name="projectId" required className="min-w-[220px]">
              <option value="">Select project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.company.name} · {p.name}
                </option>
              ))}
            </Select>
            <Select name="roleDefinitionId" required className="min-w-[200px]">
              {projectRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.displayName}
                </option>
              ))}
            </Select>
            <Button type="submit">Assign / update</Button>
          </form>
        </Card>
      ) : null}

      {canSoftDelete ? (
        <Card className="border-rose-600/20 p-4">
          <CardTitle>Danger zone</CardTitle>
          <p className="mt-1 text-xs text-[hsl(var(--muted))]">Soft-deletes this user (sign-in disabled). Restore from Trash.</p>
          <form action={softDeleteUserAction} className="mt-3">
            <input type="hidden" name="userId" value={target.id} />
            <Button type="submit" variant="secondary" className="border border-rose-600/40 bg-rose-600/10 text-rose-900 dark:text-rose-100">
              Move user to trash
            </Button>
          </form>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <CardTitle>Company memberships</CardTitle>
          <ul className="mt-2 space-y-1 text-sm">
            {target.companyMemberships.map((m) => (
              <li key={m.id}>
                {m.company.name} — {m.roleDefinition.displayName}
              </li>
            ))}
            {!target.companyMemberships.length ? <li className="text-[hsl(var(--muted))]">None</li> : null}
          </ul>
        </Card>
        <Card className="p-4">
          <CardTitle>Project memberships</CardTitle>
          <ul className="mt-2 space-y-1 text-sm">
            {target.projectMemberships.map((m) => (
              <li key={m.id}>
                <Link className="hover:underline" href={`/projects/${m.projectId}`}>
                  {m.project.company.name} · {m.project.name}
                </Link>{" "}
                — {m.roleDefinition.displayName}
              </li>
            ))}
            {!target.projectMemberships.length ? <li className="text-[hsl(var(--muted))]">None</li> : null}
          </ul>
        </Card>
      </section>
    </div>
  );
}
