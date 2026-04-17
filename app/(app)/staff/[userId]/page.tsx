import Link from "next/link";
import { notFound } from "next/navigation";
import { updateCompanionAction } from "@/app/actions/companion";
import { softDeleteUserAction } from "@/app/actions/trash";
import {
  assignProjectAction,
  removeCompanyMembershipAction,
  removeProjectMembershipAction,
  updateCompanyMembershipDepartmentAction,
  updateCompanyMembershipRoleAction,
  updateCompanyMembershipSupervisorAction,
  updateProjectMembershipRoleAction,
  updateStaffAction,
} from "@/app/actions/staff";
import {
  completeOffboardingRunAction,
  startOffboardingRunAction,
  toggleOffboardingChecklistAction,
} from "@/app/actions/lifecycle";
import { removeUserAvatarAction, uploadUserAvatarAction } from "@/app/actions/profile-media";
import { requireUser } from "@/lib/auth";
import { canManageProject, isAnyAdmin, isSuperAdmin, type AccessUser } from "@/lib/access";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { tLedgerReason } from "@/lib/ledger-labels";
import { getCompanionManifest, getCompanionManifestForUser } from "@/lib/companion-manifest";
import { sumAbilityByUser } from "@/lib/scoring";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AbilityRadar } from "@/components/ability-radar";
import { StaffAssignCompanyForm } from "@/components/staff-assign-company-form";
import { StaffObservationsPanel } from "@/components/staff-observations-panel";
import { UserFace } from "@/components/user-face";

export default async function StaffDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams?: Promise<{ uploadError?: string | string[] }>;
}) {
  const actor = (await requireUser()) as AccessUser;
  const { userId } = await params;
  const sp = (await searchParams) ?? {};
  const uploadError = Array.isArray(sp.uploadError) ? sp.uploadError[0] : sp.uploadError;
  const canViewFeedback = isAnyAdmin(actor) && (await userHasPermission(actor, "feedback.read"));

  const target = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: {
      groupMemberships: { include: { roleDefinition: true, orgGroup: true } },
      companyMemberships: { include: { company: true, roleDefinition: true, department: true, supervisor: true } },
      projectMemberships: { include: { project: { include: { company: true } }, roleDefinition: true } },
      companionProfile: true,
      performanceSnapshots: { orderBy: { createdAt: "desc" }, take: 1 },
      recognitionsReceived: {
        include: { fromUser: true, project: { include: { company: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
  if (!target) notFound();

  const feedbackReceived = canViewFeedback
    ? await prisma.feedbackEvent.findMany({
        where: { toUserId: target.id },
        include: { fromUser: true, project: { include: { company: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    : [];

  const companionSpeciesOptions =
    isSuperAdmin(actor) && (actor.id !== target.id || target.companionIntroCompletedAt)
      ? getCompanionManifest()
      : getCompanionManifestForUser(target as AccessUser);
  const canEditCompanionHere =
    isSuperAdmin(actor) || (actor.id === target.id && !target.companionIntroCompletedAt);

  const isAnyCompanyAdmin = actor.companyMemberships.some((m) => m.roleDefinition.key === "COMPANY_ADMIN");
  const isAnyGroupAdmin = actor.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN");
  const isAnyPm = actor.projectMemberships.some((m) => m.roleDefinition.key === "PROJECT_MANAGER");

  const canEditProfile =
    isSuperAdmin(actor) || actor.id === target.id || (await userHasPermission(actor, "staff.update"));

  const canAssignCompanyUI =
    (await userHasPermission(actor, "staff.assign_company")) &&
    (isSuperAdmin(actor) || isAnyGroupAdmin || isAnyCompanyAdmin);

  const supervisorCandidates = await prisma.user.findMany({
    where: { deletedAt: null, active: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
    take: 250,
  });

  const offboardingRuns = canAssignCompanyUI
    ? await prisma.offboardingRun.findMany({
        where: { userId: target.id },
        include: { company: true, checklist: true, startedBy: true },
        orderBy: { startedAt: "desc" },
        take: 8,
      })
    : [];

  const canAssignProjectUI =
    (await userHasPermission(actor, "staff.assign_project")) &&
    (isSuperAdmin(actor) || isAnyGroupAdmin || isAnyCompanyAdmin || isAnyPm);

  const companies = await prisma.company.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
  const departmentsForStaffForms = await prisma.department.findMany({
    where: { companyId: { in: companies.map((c) => c.id) } },
    include: { company: true },
    orderBy: [{ company: { name: "asc" } }, { sortOrder: "asc" }],
  });
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
    orderBy: { displayName: "asc" },
  });
  const defaultCompanyRoleId =
    companyRoles.find((r) => r.key === "COMPANY_CONTRIBUTOR")?.id ?? companyRoles[0]?.id ?? "";
  const defaultProjectRoleId =
    projectRoles.find((r) => r.key === "PROJECT_CONTRIBUTOR")?.id ?? projectRoles[0]?.id ?? "";
  const assignCompanyFormCompanies = companies.map((company) => ({ id: company.id, name: company.name }));
  const assignCompanyFormDepartments = departmentsForStaffForms.map((department) => ({
    id: department.id,
    name: department.name,
    companyId: department.companyId,
  }));
  const assignCompanyFormRoles = companyRoles.map((role) => ({ id: role.id, displayName: role.displayName }));
  const assignCompanyFormSupervisors = supervisorCandidates.map((user) => ({ id: user.id, name: user.name }));

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
  const locale = await getLocale();
  const dimList = [
    { label: t(locale, "abilityExecution"), value: ability.EXECUTION },
    { label: t(locale, "abilityCollaboration"), value: ability.COLLABORATION },
    { label: t(locale, "abilityJudgment"), value: ability.JUDGMENT },
    { label: t(locale, "abilityCreativity"), value: ability.CREATIVITY },
    { label: t(locale, "abilityKnowledge"), value: ability.KNOWLEDGE },
    { label: t(locale, "abilityReliability"), value: ability.RELIABILITY },
    { label: t(locale, "abilityGuidance"), value: ability.GUIDANCE },
  ];
  const radarPoints = dimList.map((d) => ({ label: d.label, value: d.value }));
  const sorted = [...dimList].sort((a, b) => b.value - a.value);
  const strengths = sorted.slice(0, 3);
  const growth = [...sorted].reverse().slice(0, 3);

  const canRecognizeHere =
    (await userHasPermission(actor, "recognition.create")) &&
    (isSuperAdmin(actor) || isAnyGroupAdmin || isAnyCompanyAdmin || isAnyPm);
  const canFeedbackHere =
    (await userHasPermission(actor, "feedback.submit")) &&
    (isSuperAdmin(actor) || isAnyGroupAdmin || isAnyCompanyAdmin || isAnyPm);
  const observationProjects = await prisma.project.findMany({
    where: { deletedAt: null, memberships: { some: { userId: target.id } } },
    include: { company: true },
    orderBy: { name: "asc" },
  });
  const observationProjectChoices = observationProjects.filter((p) => canManageProject(actor, p));
  const canManageFeedbackWithoutProject = isSuperAdmin(actor) || isAnyGroupAdmin;

  const ledgerEvidence = await prisma.scoreLedgerEntry.findMany({
    where: { userId: target.id },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  return (
    <div className="space-y-8">
      <div className="text-xs text-[hsl(var(--muted))]">
        <Link className="hover:underline" href="/staff">
          {t(locale, "staffBreadcrumb")}
        </Link>{" "}
        / {t(locale, "staffProfile")}
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <UserFace name={target.name} avatarUrl={target.avatarUrl} size={56} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{target.name}</h1>
          {target.title ? <p className="mt-0.5 text-sm text-[hsl(var(--muted))]">{target.title}</p> : null}
          <p className={`text-sm text-[hsl(var(--foreground))] ${target.title ? "mt-1" : "mt-0.5"}`}>{target.email}</p>
          {target.contactEmails ? (
            <p className="mt-0.5 text-sm text-[hsl(var(--muted))]">
              {t(locale, "profileContactEmailsLabel")}: {target.contactEmails}
            </p>
          ) : null}
          {target.phone ? (
            <p className="mt-0.5 text-sm text-[hsl(var(--muted))]">
              {t(locale, "profilePhoneLabel")}: {target.phone}
            </p>
          ) : null}
        </div>
      </div>

      {canEditProfile ? (
        <Card className="space-y-4 p-4">
          <CardTitle>{t(locale, "staffProfile")}</CardTitle>
          <div className="space-y-2 border-b border-[hsl(var(--border))] pb-4">
            <p className="text-xs font-medium">{t(locale, "profileAvatarLabel")}</p>
            <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "profileAvatarHelp")}</p>
            {uploadError ? (
              <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-900 dark:text-rose-100">
                {uploadError}
              </p>
            ) : null}
            <form action={uploadUserAvatarAction} encType="multipart/form-data" className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="userId" value={target.id} />
              <input type="hidden" name="returnTo" value={`/staff/${target.id}`} />
              <input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/gif" className="max-w-xs text-xs" />
              <FormSubmitButton type="submit" variant="secondary" className="h-9 text-xs">
                {t(locale, "btnSave")}
              </FormSubmitButton>
            </form>
            {target.avatarUrl ? (
              <form action={removeUserAvatarAction}>
                <input type="hidden" name="userId" value={target.id} />
                <FormSubmitButton type="submit" variant="secondary" className="h-8 text-xs">
                  {t(locale, "profileAvatarRemove")}
                </FormSubmitButton>
              </form>
            ) : null}
          </div>
          <form action={updateStaffAction} className="space-y-3">
            <input type="hidden" name="userId" value={target.id} />
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "staffName")}</label>
              <Input name="name" defaultValue={target.name} required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "staffTitle")}</label>
              <Input name="title" defaultValue={target.title ?? ""} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "profileContactEmailsLabel")}</label>
              <Input name="contactEmails" defaultValue={target.contactEmails ?? ""} placeholder="a@firm.com; b@…" />
              <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "profileContactEmailsHelp")}</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "profilePhoneLabel")}</label>
              <Input name="phone" defaultValue={target.phone ?? ""} />
            </div>
            {isSuperAdmin(actor) ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={target.active} />
                {t(locale, "staffActive")}
              </label>
            ) : null}
            <FormSubmitButton type="submit">{t(locale, "staffSave")}</FormSubmitButton>
          </form>
        </Card>
      ) : (
        <Card className="p-4 text-sm text-[hsl(var(--muted))]">{t(locale, "staffNoEdit")}</Card>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <CardTitle>{t(locale, "staffAbilityRadar")}</CardTitle>
          <AbilityRadar points={radarPoints} />
          <div className="grid gap-2 text-xs text-[hsl(var(--muted))] md:grid-cols-2">
            <div>
              <p className="font-medium text-[hsl(var(--foreground))]">{t(locale, "strengths")}</p>
              <ul className="mt-1 list-disc pl-4">
                {strengths.map((s) => (
                  <li key={s.label}>{s.label}: {s.value}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium text-[hsl(var(--foreground))]">{t(locale, "growthNotes")}</p>
              <ul className="mt-1 list-disc pl-4">
                {growth.map((s) => (
                  <li key={s.label}>{s.label}: {s.value}</li>
                ))}
              </ul>
            </div>
          </div>
          {latestScore ? (
            <p className="text-xs text-[hsl(var(--muted))]">
              {t(locale, "staffSnapshotTrend")}: {latestScore.trendDelta >= 0 ? "+" : ""}
              {latestScore.trendDelta}
            </p>
          ) : null}
          <div className="text-xs text-[hsl(var(--muted))]">
            <p className="font-medium text-[hsl(var(--foreground))]">{t(locale, "staffLedgerTrail")}</p>
            <ul className="mt-1 space-y-1">
              {ledgerEvidence.map((e) => (
                <li key={e.id}>
                  {e.createdAt.toISOString().slice(0, 10)} · {e.leaderboardCategory} · {e.polarity} · {e.delta}{" "}
                  <span className="text-[hsl(var(--muted))]">{tLedgerReason(locale, e.reasonKey)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <CardTitle>{t(locale, "staffCompanionSection")}</CardTitle>
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
                <div className="font-medium">
                  {target.companionProfile.name ?? t(locale, "staffCompanionDefaultName")}
                </div>
                <div className="text-xs text-[hsl(var(--muted))]">
                  {t(locale, "homeMood")}: {target.companionProfile.mood}
                </div>
                <div className="text-xs text-[hsl(var(--muted))]">
                  {t(locale, "homeLevel")}: {target.companionProfile.level}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "staffCompanionNoSelection")}</p>
          )}
          {actor.id === target.id && target.companionIntroCompletedAt && !isSuperAdmin(actor) ? (
            <p className="mt-2 border-t pt-2 text-sm text-[hsl(var(--muted))]">{t(locale, "companionPermanentWarning")}</p>
          ) : null}
          {canEditCompanionHere ? (
            <form action={updateCompanionAction} className="mt-2 flex flex-wrap items-end gap-2 border-t pt-2">
              {actor.id !== target.id ? <input type="hidden" name="userId" value={target.id} /> : null}
              <div className="space-y-1">
                <label className="text-xs font-medium">{t(locale, "staffSpecies")}</label>
                <Select name="species" defaultValue={target.companionProfile?.species ?? companionSpeciesOptions[0]?.species ?? "BUNNY"}>
                  {companionSpeciesOptions.map((e) => (
                    <option key={e.id} value={e.species}>
                      {locale === "zh" ? e.name_zh : e.name_en}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">{t(locale, "staffDisplayName")}</label>
                <Input
                  name="name"
                  placeholder={t(locale, "commonOptional")}
                  defaultValue={target.companionProfile?.name ?? ""}
                />
              </div>
              <FormSubmitButton type="submit" variant="secondary" className="h-9 text-xs">
                {t(locale, "staffSaveCompanion")}
              </FormSubmitButton>
            </form>
          ) : null}
        </Card>
      </section>

      <StaffObservationsPanel
        actor={actor}
        locale={locale}
        targetUserId={target.id}
        projectChoices={observationProjectChoices}
        recognitions={target.recognitionsReceived}
        feedback={feedbackReceived}
        canCreateRecognition={canRecognizeHere}
        canCreateFeedback={canFeedbackHere}
        canViewFeedback={canViewFeedback}
        canManageFeedbackWithoutProject={canManageFeedbackWithoutProject}
      />

      {canAssignCompanyUI ? (
        <Card className="space-y-3 p-4">
          <CardTitle>{t(locale, "staffAssignCompany")}</CardTitle>
          <StaffAssignCompanyForm
            userId={target.id}
            companies={assignCompanyFormCompanies}
            departments={assignCompanyFormDepartments}
            companyRoles={assignCompanyFormRoles}
            supervisorCandidates={assignCompanyFormSupervisors}
            defaultCompanyRoleId={defaultCompanyRoleId}
            labels={{
              company: t(locale, "commonCompany"),
              department: t(locale, "projFieldDepartment"),
              permission: locale === "zh" ? "权限" : "Permission",
              supervisor: locale === "zh" ? "主管（如有）" : "Supervisor (if any)",
              selectCompany: t(locale, "staffSelectCompany"),
              noDepartment: t(locale, "projDeptGroupNone"),
              noSupervisor: t(locale, "staffSupervisorNone"),
              submit: t(locale, "projAssignBtn"),
            }}
          />
        </Card>
      ) : null}

      {canAssignProjectUI ? (
        <Card className="space-y-3 p-4">
          <CardTitle>{t(locale, "staffAssignProject")}</CardTitle>
          <form action={assignProjectAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="userId" value={target.id} />
            <Select name="projectId" required className="min-w-[220px]">
              <option value="">{t(locale, "staffSelectProject")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.company.name} · {p.name}
                </option>
              ))}
            </Select>
            <Select name="roleDefinitionId" required defaultValue={defaultProjectRoleId} className="min-w-[200px]">
              {projectRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.displayName}
                </option>
              ))}
            </Select>
            <FormSubmitButton type="submit">{t(locale, "projAssignBtn")}</FormSubmitButton>
          </form>
        </Card>
      ) : null}

      {canAssignCompanyUI || canSoftDelete ? (
        <Card className={`p-4 ${canAssignCompanyUI && canSoftDelete ? "space-y-6" : "space-y-3"} ${!canAssignCompanyUI && canSoftDelete ? "border-rose-600/20" : ""}`}>
          {canAssignCompanyUI ? (
            <div className="space-y-3">
              <CardTitle>{t(locale, "offboardingTitle")}</CardTitle>
              <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "offboardingChecklist")}</p>
              <form action={startOffboardingRunAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="userId" value={target.id} />
                <Select name="companyId" required className="min-w-[220px]">
                  <option value="">{t(locale, "staffSelectCompany")}</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <FormSubmitButton type="submit" variant="secondary">
                  {t(locale, "offboardingStart")}
                </FormSubmitButton>
              </form>
              <ul className="space-y-3 text-xs">
                {offboardingRuns.map((run) => (
                  <li key={run.id} className="rounded-md border border-[hsl(var(--border))] p-3">
                    <div className="font-medium text-[hsl(var(--foreground))]">
                      {run.company.name} · {run.status} · {run.startedAt.toISOString().slice(0, 10)}
                    </div>
                    <ul className="mt-2 space-y-1">
                      {run.checklist.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-2">
                          <span className={c.completedAt ? "text-[hsl(var(--muted))] line-through" : ""}>{c.label}</span>
                          <form action={toggleOffboardingChecklistAction}>
                            <input type="hidden" name="itemId" value={c.id} />
                            <FormSubmitButton type="submit" variant="secondary" className="h-7 px-2 text-xs">
                              {c.completedAt ? "Undo" : "Done"}
                            </FormSubmitButton>
                          </form>
                        </li>
                      ))}
                    </ul>
                    {run.status === "IN_PROGRESS" && run.checklist.every((c) => c.completedAt) ? (
                      <form action={completeOffboardingRunAction} className="mt-2">
                        <input type="hidden" name="runId" value={run.id} />
                        <FormSubmitButton type="submit" className="h-8 text-xs">
                          {t(locale, "onboardingCompleted")}
                        </FormSubmitButton>
                      </form>
                    ) : null}
                  </li>
                ))}
                {!offboardingRuns.length ? <li className="text-[hsl(var(--muted))]">—</li> : null}
              </ul>
            </div>
          ) : null}

          {canSoftDelete ? (
            <div className={canAssignCompanyUI ? "space-y-3 border-t border-[hsl(var(--border))] pt-4" : "space-y-3"}>
              <CardTitle>{t(locale, "projDangerSoftDelete")}</CardTitle>
              <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "projSoftDeleteHint")}</p>
              <form action={softDeleteUserAction}>
                <input type="hidden" name="userId" value={target.id} />
                <FormSubmitButton
                  type="submit"
                  variant="secondary"
                  className="border border-rose-600/40 bg-rose-600/10 text-rose-900 dark:text-rose-100"
                >
                  {t(locale, "projMoveUserTrash")}
                </FormSubmitButton>
              </form>
            </div>
          ) : null}
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <CardTitle>{t(locale, "projCompanyMemberships")}</CardTitle>
          <ul className="mt-2 space-y-2 text-sm">
            {target.companyMemberships.map((m) => (
              <li key={m.id} className="space-y-2 rounded-md border border-[hsl(var(--border))] p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {m.company.name} — {m.roleDefinition.displayName}
                    {m.department ? (
                      <span className="text-[hsl(var(--muted))]">
                        {" "}
                        · {m.department.name}
                      </span>
                    ) : null}
                  </span>
                  {canAssignCompanyUI ? (
                    <form action={removeCompanyMembershipAction}>
                      <input type="hidden" name="userId" value={target.id} />
                      <input type="hidden" name="companyId" value={m.companyId} />
                      <FormSubmitButton type="submit" variant="secondary" className="h-7 px-2 text-xs">
                        {t(locale, "btnRemove")}
                      </FormSubmitButton>
                    </form>
                  ) : null}
                </div>
                {canAssignCompanyUI ? (
                  <form action={updateCompanyMembershipRoleAction} className="flex flex-wrap items-end gap-2 text-xs">
                    <input type="hidden" name="userId" value={target.id} />
                    <input type="hidden" name="companyId" value={m.companyId} />
                    <div className="min-w-[180px] flex-1 space-y-1">
                      <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "commonRole")}</label>
                      <Select name="roleDefinitionId" defaultValue={m.roleDefinitionId} className="h-8 text-xs">
                        {companyRoles.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.displayName}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <FormSubmitButton type="submit" variant="secondary" className="h-8 text-xs">
                      {t(locale, "btnSave")}
                    </FormSubmitButton>
                  </form>
                ) : null}
                {canAssignCompanyUI ? (
                  <form action={updateCompanyMembershipDepartmentAction} className="flex flex-wrap items-end gap-2 text-xs">
                    <input type="hidden" name="userId" value={target.id} />
                    <input type="hidden" name="companyId" value={m.companyId} />
                    <div className="min-w-[180px] flex-1 space-y-1">
                      <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "projFieldDepartment")}</label>
                      <Select name="departmentId" defaultValue={m.departmentId ?? ""} className="h-8 text-xs">
                        <option value="">{t(locale, "projDeptGroupNone")}</option>
                        {departmentsForStaffForms
                          .filter((d) => d.companyId === m.companyId)
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                      </Select>
                    </div>
                    <FormSubmitButton type="submit" variant="secondary" className="h-8 text-xs">
                      {t(locale, "btnSave")}
                    </FormSubmitButton>
                  </form>
                ) : null}
                {canAssignCompanyUI ? (
                  <form action={updateCompanyMembershipSupervisorAction} className="flex flex-wrap items-end gap-2 text-xs">
                    <input type="hidden" name="userId" value={target.id} />
                    <input type="hidden" name="companyId" value={m.companyId} />
                    <div className="min-w-[200px] flex-1 space-y-1">
                      <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "staffSupervisorLabel")}</label>
                      <Select name="supervisorUserId" defaultValue={m.supervisorUserId ?? ""} className="h-8 text-xs">
                        <option value="">{t(locale, "staffSupervisorNone")}</option>
                        {supervisorCandidates.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <FormSubmitButton type="submit" variant="secondary" className="h-8 text-xs">
                      {t(locale, "btnSave")}
                    </FormSubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
            {!target.companyMemberships.length ? (
              <li className="text-[hsl(var(--muted))]">{t(locale, "projNone")}</li>
            ) : null}
          </ul>
        </Card>
        <Card className="p-4">
          <CardTitle>{t(locale, "projProjectMemberships")}</CardTitle>
          <ul className="mt-2 space-y-2 text-sm">
            {target.projectMemberships.map((m) => (
              <li key={m.id} className="space-y-2 rounded-md border border-[hsl(var(--border))] p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
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
                      <FormSubmitButton type="submit" variant="secondary" className="h-7 px-2 text-xs">
                        {t(locale, "btnRemove")}
                      </FormSubmitButton>
                    </form>
                  ) : null}
                </div>
                {canAssignProjectUI ? (
                  <form action={updateProjectMembershipRoleAction} className="flex flex-wrap items-end gap-2 text-xs">
                    <input type="hidden" name="userId" value={target.id} />
                    <input type="hidden" name="projectId" value={m.projectId} />
                    <div className="min-w-[180px] flex-1 space-y-1">
                      <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "commonRole")}</label>
                      <Select name="roleDefinitionId" defaultValue={m.roleDefinitionId} className="h-8 text-xs">
                        {projectRoles.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.displayName}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <FormSubmitButton type="submit" variant="secondary" className="h-8 text-xs">
                      {t(locale, "btnSave")}
                    </FormSubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
            {!target.projectMemberships.length ? (
              <li className="text-[hsl(var(--muted))]">{t(locale, "projNone")}</li>
            ) : null}
          </ul>
        </Card>
      </section>
    </div>
  );
}
