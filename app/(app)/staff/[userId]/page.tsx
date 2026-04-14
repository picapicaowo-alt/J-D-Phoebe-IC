import Link from "next/link";
import { notFound } from "next/navigation";
import { createFeedbackEventAction } from "@/app/actions/feedback";
import { updateCompanionAction } from "@/app/actions/companion";
import { softDeleteUserAction } from "@/app/actions/trash";
import {
  assignCompanyAction,
  assignProjectAction,
  removeCompanyMembershipAction,
  removeProjectMembershipAction,
  updateStaffAction,
} from "@/app/actions/staff";
import { requireUser } from "@/lib/auth";
import { canViewProject, isSuperAdmin, type AccessUser } from "@/lib/access";
import { getLocale } from "@/lib/locale";
import { displayRecognitionSecondary } from "@/lib/recognition-catalog";
import { getCompanionManifest } from "@/lib/companion-manifest";
import { sumAbilityByUser } from "@/lib/scoring";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AbilityRadar } from "@/components/ability-radar";
import { FeedbackSecondarySelect } from "@/components/feedback-secondary-select";
import { labelRecognitionCategory } from "@/lib/labels";

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
      feedbackReceived: {
        include: { fromUser: true, project: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      },
    },
  });
  if (!target) notFound();

  const locale = await getLocale();

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
  const until = new Date();
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - 90);
  const ability = await sumAbilityByUser(prisma, target.id, since, until);
  const dimList = [
    { label: "Execution", value: ability.EXECUTION },
    { label: "Collaboration", value: ability.COLLABORATION },
    { label: "Judgment", value: ability.JUDGMENT },
    { label: "Creativity", value: ability.CREATIVITY },
    { label: "Knowledge", value: ability.KNOWLEDGE },
    { label: "Reliability", value: ability.RELIABILITY },
    { label: "Guidance", value: ability.GUIDANCE },
  ];
  const radarPoints = dimList.map((d) => ({ label: d.label, value: d.value }));
  const sorted = [...dimList].sort((a, b) => b.value - a.value);
  const strengths = sorted.slice(0, 3);
  const growth = [...sorted].reverse().slice(0, 3);

  const canFeedbackHere =
    (await userHasPermission(actor, "feedback.submit")) &&
    (isSuperAdmin(actor) || isAnyGroupAdmin || isAnyCompanyAdmin || isAnyPm);
  const feedbackProjects = await prisma.project.findMany({
    where: { deletedAt: null, memberships: { some: { userId: target.id } } },
    include: { company: true },
  });
  const feedbackProjectChoices = feedbackProjects.filter((p) => canViewProject(actor, p));

  const ledgerEvidence = await prisma.scoreLedgerEntry.findMany({
    where: { userId: target.id },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

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
          <CardTitle>Ability radar</CardTitle>
          <AbilityRadar points={radarPoints} />
          <div className="grid gap-2 text-xs text-[hsl(var(--muted))] md:grid-cols-2">
            <div>
              <p className="font-medium text-[hsl(var(--foreground))]">Strengths</p>
              <ul className="mt-1 list-disc pl-4">
                {strengths.map((s) => (
                  <li key={s.label}>{s.label}: {s.value}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium text-[hsl(var(--foreground))]">Growth notes</p>
              <ul className="mt-1 list-disc pl-4">
                {growth.map((s) => (
                  <li key={s.label}>{s.label}: {s.value}</li>
                ))}
              </ul>
            </div>
          </div>
          {latestScore ? (
            <p className="text-xs text-[hsl(var(--muted))]">Snapshot trend delta: {latestScore.trendDelta >= 0 ? "+" : ""}{latestScore.trendDelta}</p>
          ) : null}
          <div className="text-xs text-[hsl(var(--muted))]">
            <p className="font-medium text-[hsl(var(--foreground))]">Needs attention (evidence trail)</p>
            <ul className="mt-1 space-y-1">
              {ledgerEvidence.map((e) => (
                <li key={e.id}>
                  {e.createdAt.toISOString().slice(0, 10)} · {e.leaderboardCategory} · {e.polarity} · {e.delta}{" "}
                  <span className="text-[hsl(var(--muted))]">({e.reasonKey})</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <CardTitle>Companion</CardTitle>
          {target.companionProfile ? (
            <div className="flex flex-wrap items-start gap-3 text-sm">
              {(() => {
                const asset = getCompanionManifest().find((e) => e.species === target.companionProfile!.species);
                return asset ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asset.file} alt="" width={72} height={72} className="h-[72px] w-[72px] rounded-3xl object-contain" />
                ) : null;
              })()}
              <div className="space-y-1">
                <div className="font-medium">{target.companionProfile.name ?? "Companion"}</div>
                <div className="text-xs text-[hsl(var(--muted))]">Mood: {target.companionProfile.mood}</div>
                <div className="text-xs text-[hsl(var(--muted))]">Level: {target.companionProfile.level}</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[hsl(var(--muted))]">No companion selected yet.</p>
          )}
          {actor.id === target.id ? (
            <form action={updateCompanionAction} className="mt-2 flex flex-wrap items-end gap-2 border-t pt-2">
              <div className="space-y-1">
                <label className="text-xs font-medium">Species</label>
                <Select name="species" defaultValue={target.companionProfile?.species ?? "BUNNY"}>
                  {getCompanionManifest().map((e) => (
                    <option key={e.id} value={e.species}>
                      {locale === "zh" ? e.name_zh : e.name_en}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Display name</label>
                <Input name="name" placeholder="Optional" defaultValue={target.companionProfile?.name ?? ""} />
              </div>
              <Button type="submit" variant="secondary" className="h-9 text-xs">
                Save companion
              </Button>
            </form>
          ) : null}
        </Card>
      </section>

      <Card className="space-y-3 p-4">
        <CardTitle>Recognition received</CardTitle>
        {target.recognitionsReceived.length ? (
          <ul className="space-y-2 text-sm">
            {target.recognitionsReceived.map((r) => (
              <li key={r.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
                <div className="font-medium">
                  {r.secondaryLabelKey
                    ? displayRecognitionSecondary(r.tagCategory, r.secondaryLabelKey, locale)
                    : (r.tagLabel ?? "")}
                </div>
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

      {canFeedbackHere && actor.id !== target.id && feedbackProjectChoices.length ? (
        <Card className="space-y-3 p-4">
          <CardTitle>Growth observations (about this member)</CardTitle>
          <p className="text-xs text-[hsl(var(--muted))]">Structured, separate from recognition. Choose a shared project for context.</p>
          <form action={createFeedbackEventAction} className="grid gap-2 md:grid-cols-2">
            <input type="hidden" name="toUserId" value={target.id} />
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">Project context</label>
              <Select name="projectId" required>
                {feedbackProjectChoices.map((p) => (
                  <option key={p.id} value={p.id}>{p.company.name} · {p.name}</option>
                ))}
              </Select>
            </div>
            <div className="md:col-span-2">
              <FeedbackSecondarySelect locale={locale} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">Growth note (optional)</label>
              <Input name="message" />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" variant="secondary">Save observation</Button>
            </div>
          </form>
        </Card>
      ) : null}

      {(actor.id === target.id || (await userHasPermission(actor, "feedback.read"))) && target.feedbackReceived.length ? (
        <Card className="space-y-3 p-4">
          <CardTitle>Growth observations on file</CardTitle>
          <ul className="space-y-2 text-sm">
            {target.feedbackReceived.map((f) => (
              <li key={f.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
                <div className="text-xs text-[hsl(var(--muted))]">
                  {f.project?.name ?? "Project"} · {f.createdAt.toISOString().slice(0, 10)}
                </div>
                {f.message ? <p className="mt-1">{f.message}</p> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

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
          <ul className="mt-2 space-y-2 text-sm">
            {target.companyMemberships.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {m.company.name} — {m.roleDefinition.displayName}
                </span>
                {canAssignCompanyUI ? (
                  <form action={removeCompanyMembershipAction}>
                    <input type="hidden" name="userId" value={target.id} />
                    <input type="hidden" name="companyId" value={m.companyId} />
                    <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                      Remove
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
            {!target.companyMemberships.length ? <li className="text-[hsl(var(--muted))]">None</li> : null}
          </ul>
        </Card>
        <Card className="p-4">
          <CardTitle>Project memberships</CardTitle>
          <ul className="mt-2 space-y-2 text-sm">
            {target.projectMemberships.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <Link className="hover:underline" href={`/projects/${m.projectId}`}>
                    {m.project.company.name} · {m.project.name}
                  </Link>{" "}
                  — {m.roleDefinition.displayName}
                </span>
                {canAssignProjectUI ? (
                  <form action={removeProjectMembershipAction}>
                    <input type="hidden" name="userId" value={target.id} />
                    <input type="hidden" name="projectId" value={m.projectId} />
                    <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                      Remove
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
            {!target.projectMemberships.length ? <li className="text-[hsl(var(--muted))]">None</li> : null}
          </ul>
        </Card>
      </section>
    </div>
  );
}
