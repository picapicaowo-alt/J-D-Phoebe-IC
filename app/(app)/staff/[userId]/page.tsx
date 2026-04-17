import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
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
  skipMemberOnboardingAction,
  startOffboardingRunAction,
  toggleOffboardingChecklistAction,
} from "@/app/actions/lifecycle";
import { removeUserAvatarAction, uploadUserAvatarAction } from "@/app/actions/profile-media";
import { requireUser } from "@/lib/auth";
import { canManageProject, isAnyAdmin, isSuperAdmin, staffVisibilityWhere, type AccessUser } from "@/lib/access";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { tLedgerReason } from "@/lib/ledger-labels";
import { getCompanionManifest, getCompanionManifestForUser } from "@/lib/companion-manifest";
import { sumAbilityByUser } from "@/lib/scoring";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  canManageCompanyScopeWithRoleIds,
  canManageProjectScopeWithRoleIds,
  getActorRoleIdsByPermission,
  mergeRoleIdSets,
} from "@/lib/scoped-role-access";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AbilityRadar } from "@/components/ability-radar";
import { StaffAssignCompanyForm } from "@/components/staff-assign-company-form";
import { StaffAvatarPreview } from "@/components/staff-avatar-preview";
import { StaffObservationsPanel } from "@/components/staff-observations-panel";

function formatOnboardingTimestamp(when: Date) {
  return when.toISOString().slice(0, 16).replace("T", " ");
}

function isMissingColumnError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022";
}

async function withMissingColumnFallback<T>(label: string, query: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    console.warn(`[staff detail] ${label} falling back after missing-column error`, error);
    return fallback;
  }
}

function defaultAbilityScores() {
  return {
    EXECUTION: 50,
    COLLABORATION: 50,
    JUDGMENT: 50,
    CREATIVITY: 50,
    KNOWLEDGE: 50,
    RELIABILITY: 50,
    GUIDANCE: 50,
  };
}

async function loadStaffDetailTarget(actor: AccessUser, userId: string) {
  const where: Prisma.UserWhereInput = {
    AND: [{ id: userId, deletedAt: null }, staffVisibilityWhere(actor)],
  };

  try {
    return await prisma.user.findFirst({
      where,
      include: {
        groupMemberships: { include: { roleDefinition: true, orgGroup: true } },
        companyMemberships: { include: { company: true, roleDefinition: true, department: true, supervisor: true } },
        memberOnboardings: {
          include: { company: { select: { name: true } } },
          orderBy: [{ deadlineAt: "asc" }, { createdAt: "asc" }],
        },
        projectMemberships: { include: { project: { include: { company: true } }, roleDefinition: true } },
        companionProfile: true,
        performanceSnapshots: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    console.warn("[staff detail] using legacy-compatible staff target query", error);

    const legacyTarget = await prisma.user.findFirst({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        title: true,
        active: true,
        isSuperAdmin: true,
        groupMemberships: {
          select: {
            id: true,
            orgGroupId: true,
            roleDefinitionId: true,
            roleDefinition: { select: { id: true, key: true, displayName: true } },
            orgGroup: { select: { id: true, name: true } },
          },
        },
        companyMemberships: {
          select: {
            id: true,
            companyId: true,
            roleDefinitionId: true,
            company: { select: { id: true, name: true, orgGroupId: true } },
            roleDefinition: { select: { id: true, key: true, displayName: true } },
          },
        },
        projectMemberships: {
          select: {
            id: true,
            projectId: true,
            roleDefinitionId: true,
            roleDefinition: { select: { id: true, key: true, displayName: true } },
            project: {
              select: {
                id: true,
                name: true,
                companyId: true,
                company: { select: { id: true, name: true, orgGroupId: true } },
              },
            },
          },
        },
      },
    });

    if (!legacyTarget) return null;

    return {
      ...legacyTarget,
      avatarUrl: null,
      contactEmails: null,
      phone: null,
      signature: null,
      companionIntroCompletedAt: null,
      memberOnboardings: [],
      companionProfile: null,
      performanceSnapshots: [],
      companyMemberships: legacyTarget.companyMemberships.map((membership) => ({
        ...membership,
        departmentId: null,
        department: null,
        supervisorUserId: null,
        supervisor: null,
      })),
    };
  }
}

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
  const [
    canReadStaffPermission,
    canCreateRecognitionPermission,
    canReadRecognitionPermission,
    canCreateFeedbackPermission,
    canReadFeedbackPermission,
    canUpdateStaffPermission,
    canSoftDeletePermission,
  ] = await Promise.all([
    userHasPermission(actor, "staff.read"),
    userHasPermission(actor, "recognition.create"),
    userHasPermission(actor, "recognition.read"),
    userHasPermission(actor, "feedback.submit"),
    userHasPermission(actor, "feedback.read"),
    userHasPermission(actor, "staff.update"),
    userHasPermission(actor, "staff.soft_delete"),
  ]);

  const canReadStaff = actor.id === userId || canReadStaffPermission;
  if (!canReadStaff) notFound();
  const canViewRecognition = canCreateRecognitionPermission || canReadRecognitionPermission;
  const canViewFeedback = isAnyAdmin(actor) && canReadFeedbackPermission;

  const target = await loadStaffDetailTarget(actor, userId);
  if (!target) notFound();
  const canEditCompanionHere =
    isSuperAdmin(actor) || (actor.id === target.id && !target.companionIntroCompletedAt);
  const companionSpeciesOptions =
    !canEditCompanionHere
      ? getCompanionManifest()
      : isSuperAdmin(actor) && (actor.id !== target.id || target.companionIntroCompletedAt)
        ? getCompanionManifest()
        : getCompanionManifestForUser(actor);
  const canSkipStaffOnboarding = isSuperAdmin(actor) && actor.id !== target.id;
  const onboardingByCompanyId = new Map(target.memberOnboardings.map((ob) => [ob.companyId, ob]));
  const pendingOnboardings = target.memberOnboardings.filter((ob) => !ob.completedAt);
  const onboardingAdminRows = target.companyMemberships.map((membership) => ({
    companyId: membership.companyId,
    companyName: membership.company.name,
    onboarding: onboardingByCompanyId.get(membership.companyId) ?? null,
  }));

  const isAnyCompanyAdmin = actor.companyMemberships.some((m) => m.roleDefinition.key === "COMPANY_ADMIN");
  const isAnyGroupAdmin = actor.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN");
  const isAnyPm = actor.projectMemberships.some((m) => m.roleDefinition.key === "PROJECT_MANAGER");
  const canEditProfile = isSuperAdmin(actor) || actor.id === target.id || canUpdateStaffPermission;
  const until = new Date();
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - 90);

  const [
    recognitionsReceived,
    feedbackReceived,
    actorRoleIdsByPermission,
    supervisorCandidates,
    companies,
    departmentsForStaffForms,
    projects,
    companyRoles,
    projectRoles,
    ability,
    locale,
    observationProjects,
    ledgerEvidence,
  ] = await Promise.all([
    canViewRecognition
      ? prisma.recognitionEvent.findMany({
          where: { toUserId: target.id },
          include: { fromUser: true, project: { include: { company: true } } },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
    canViewFeedback
      ? prisma.feedbackEvent.findMany({
          where: { toUserId: target.id },
          include: { fromUser: true, project: { include: { company: true } } },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
    getActorRoleIdsByPermission(actor, ["staff.assign_company", "staff.assign_project", "project.member.manage"]),
    prisma.user.findMany({
      where: { deletedAt: null, active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
      take: 250,
    }),
    prisma.company.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    withMissingColumnFallback(
      "staff form departments",
      () =>
        prisma.department.findMany({
          where: { company: { deletedAt: null } },
          include: { company: true },
          orderBy: [{ company: { name: "asc" } }, { sortOrder: "asc" }],
        }),
      [],
    ),
    prisma.project.findMany({
      where: { deletedAt: null, company: { deletedAt: null } },
      orderBy: { name: "asc" },
      include: { company: true },
    }),
    prisma.roleDefinition.findMany({
      where: { appliesScope: "COMPANY" },
      orderBy: { displayName: "asc" },
    }),
    prisma.roleDefinition.findMany({
      where: { appliesScope: "PROJECT" },
      orderBy: { displayName: "asc" },
    }),
    withMissingColumnFallback("ability radar", () => sumAbilityByUser(prisma, target.id, since, until), defaultAbilityScores()),
    getLocale(),
    prisma.project.findMany({
      where: { deletedAt: null, memberships: { some: { userId: target.id } } },
      include: { company: true },
      orderBy: { name: "asc" },
    }),
    withMissingColumnFallback(
      "score ledger trail",
      () =>
        prisma.scoreLedgerEntry.findMany({
          where: { userId: target.id },
          orderBy: { createdAt: "desc" },
          take: 12,
        }),
      [],
    ),
  ]);
  const companyAssignmentRoleIds = actorRoleIdsByPermission.get("staff.assign_company") ?? new Set<string>();
  const projectAssignmentRoleIds = mergeRoleIdSets(
    actorRoleIdsByPermission.get("staff.assign_project"),
    actorRoleIdsByPermission.get("project.member.manage"),
  );
  const manageableCompanies = companies.filter((company) =>
    canManageCompanyScopeWithRoleIds(actor, company, companyAssignmentRoleIds),
  );
  const manageableCompanyIds = new Set(manageableCompanies.map((company) => company.id));
  const manageableOffboardingCompanies = manageableCompanies.filter((company) =>
    target.companyMemberships.some((membership) => membership.companyId === company.id),
  );
  const manageableProjects = projects.filter((project) =>
    canManageProjectScopeWithRoleIds(actor, project, projectAssignmentRoleIds),
  );
  const manageableProjectIds = new Set(manageableProjects.map((project) => project.id));
  const canAssignCompanyUI = manageableCompanies.length > 0;
  const canAssignProjectUI = manageableProjects.length > 0;
  const offboardingRuns = canAssignCompanyUI
    ? await withMissingColumnFallback(
        "offboarding runs",
        () =>
          prisma.offboardingRun.findMany({
            where: { userId: target.id, companyId: { in: [...manageableCompanyIds] } },
            include: { company: true, checklist: true, startedBy: true },
            orderBy: { startedAt: "desc" },
            take: 8,
          }),
        [],
      )
    : [];
  const defaultCompanyRoleId =
    companyRoles.find((r) => r.key === "COMPANY_CONTRIBUTOR")?.id ?? companyRoles[0]?.id ?? "";
  const defaultProjectRoleId =
    projectRoles.find((r) => r.key === "PROJECT_CONTRIBUTOR")?.id ?? projectRoles[0]?.id ?? "";
  const assignCompanyFormCompanies = manageableCompanies.map((company) => ({ id: company.id, name: company.name }));
  const assignCompanyFormDepartments = departmentsForStaffForms.map((department) => ({
    id: department.id,
    name: department.name,
    companyId: department.companyId,
  }));
  const assignCompanyFormRoles = companyRoles.map((role) => ({ id: role.id, displayName: role.displayName }));
  const assignCompanyFormSupervisors = supervisorCandidates.map((user) => ({ id: user.id, name: user.name }));

  const canSoftDelete =
    canSoftDeletePermission &&
    (isSuperAdmin(actor) || isAnyGroupAdmin) &&
    actor.id !== target.id &&
    !(target.isSuperAdmin && !isSuperAdmin(actor));

  const latestScore = target.performanceSnapshots[0] ?? null;
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
    canCreateRecognitionPermission &&
    (isSuperAdmin(actor) || isAnyGroupAdmin || isAnyCompanyAdmin || isAnyPm);
  const canFeedbackHere =
    canCreateFeedbackPermission &&
    (isSuperAdmin(actor) || isAnyGroupAdmin || isAnyCompanyAdmin || isAnyPm);
  const observationProjectChoices = observationProjects.filter((p) => canManageProject(actor, p));
  const canManageFeedbackWithoutProject = isSuperAdmin(actor) || isAnyGroupAdmin;

  return (
    <div className="space-y-8">
      <div className="text-xs text-[hsl(var(--muted))]">
        <Link className="hover:underline" href="/staff">
          {t(locale, "staffBreadcrumb")}
        </Link>{" "}
        / {t(locale, "staffProfile")}
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <StaffAvatarPreview name={target.name} avatarUrl={target.avatarUrl} size={56} />
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
          {target.signature ? <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm text-[hsl(var(--foreground))]">{target.signature}</p> : null}
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
              <label className="text-xs font-medium" htmlFor="staff-signature">
                {t(locale, "profileSignatureLabel")}
              </label>
              <textarea
                id="staff-signature"
                name="signature"
                rows={3}
                defaultValue={target.signature ?? ""}
                maxLength={280}
                placeholder={t(locale, "profileSignaturePlaceholder")}
                className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm"
              />
              <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "profileSignatureHelp")}</p>
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
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="active" defaultChecked={target.active} />
                  {t(locale, "staffActive")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isSuperAdmin" defaultChecked={target.isSuperAdmin} />
                  {t(locale, "superAdminBadge")}
                </label>
              </>
            ) : null}
            <FormSubmitButton type="submit">{t(locale, "staffSave")}</FormSubmitButton>
          </form>
        </Card>
      ) : (
        <Card className="p-4 text-sm text-[hsl(var(--muted))]">{t(locale, "staffNoEdit")}</Card>
      )}

      {canSkipStaffOnboarding ? (
        <Card className="space-y-4 p-4">
          <CardTitle>{t(locale, "staffOnboardingAdminTitle")}</CardTitle>
          <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "staffOnboardingAdminHint")}</p>
          {!onboardingAdminRows.length ? (
            <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "staffOnboardingNone")}</p>
          ) : (
            <ul className="space-y-3">
              {onboardingAdminRows.map((row) => (
                <li key={row.companyId} className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-[hsl(var(--foreground))]">{row.companyName}</p>
                      <p className="mt-1 text-xs text-[hsl(var(--muted))]">
                        {row.onboarding?.completedAt
                          ? `${t(locale, "onboardingCompletedAtLabel")}: ${formatOnboardingTimestamp(row.onboarding.completedAt)}`
                          : row.onboarding
                            ? `${t(locale, "onboardingDeadline")}: ${row.onboarding.deadlineAt.toISOString().slice(0, 10)}`
                            : t(locale, "staffOnboardingNone")}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${
                        row.onboarding?.completedAt
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          : row.onboarding
                            ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                            : "bg-[hsl(var(--background))] text-[hsl(var(--muted))]"
                      }`}
                    >
                      {row.onboarding?.completedAt
                        ? t(locale, "staffOnboardingComplete")
                        : row.onboarding
                          ? t(locale, "staffOnboardingPending")
                          : t(locale, "staffOnboardingNone")}
                    </span>
                  </div>
                  {(!row.onboarding || !row.onboarding.completedAt) ? (
                    <form action={skipMemberOnboardingAction} className="mt-3">
                      {row.onboarding ? <input type="hidden" name="onboardingId" value={row.onboarding.id} /> : null}
                      {!row.onboarding ? <input type="hidden" name="userId" value={target.id} /> : null}
                      {!row.onboarding ? <input type="hidden" name="companyId" value={row.companyId} /> : null}
                      <FormSubmitButton type="submit" variant="secondary" className="h-8 text-xs">
                        {t(locale, "staffOnboardingSkipBtn")}
                      </FormSubmitButton>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {pendingOnboardings.length ? null : onboardingAdminRows.length ? (
            <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "onboardingCompleted")}</p>
          ) : null}
        </Card>
      ) : null}

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
        recognitions={recognitionsReceived}
        feedback={feedbackReceived}
        canViewRecognition={canViewRecognition}
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
              {manageableProjects.map((p) => (
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
                  {manageableOffboardingCompanies.map((c) => (
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
            {target.companyMemberships.map((m) => {
              const onboarding = onboardingByCompanyId.get(m.companyId);
              const canManageThisCompanyMembership = manageableCompanyIds.has(m.companyId);
              return (
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
                    {canManageThisCompanyMembership ? (
                      <form action={removeCompanyMembershipAction}>
                        <input type="hidden" name="userId" value={target.id} />
                        <input type="hidden" name="companyId" value={m.companyId} />
                        <FormSubmitButton type="submit" variant="secondary" className="h-7 px-2 text-xs">
                          {t(locale, "btnRemove")}
                        </FormSubmitButton>
                      </form>
                    ) : null}
                  </div>
                  {onboarding || canSkipStaffOnboarding ? (
                    <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-[hsl(var(--foreground))]">{t(locale, "navOnboarding")}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 ${
                            onboarding?.completedAt
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : onboarding
                                ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                                : "bg-[hsl(var(--background))] text-[hsl(var(--muted))]"
                          }`}
                        >
                          {onboarding?.completedAt
                            ? t(locale, "staffOnboardingComplete")
                            : onboarding
                              ? t(locale, "staffOnboardingPending")
                              : t(locale, "staffOnboardingNone")}
                        </span>
                      </div>
                      <p className="mt-2 text-[hsl(var(--muted))]">
                        {onboarding?.completedAt
                          ? `${t(locale, "onboardingCompletedAtLabel")}: ${formatOnboardingTimestamp(onboarding.completedAt)}`
                          : onboarding
                            ? `${t(locale, "onboardingDeadline")}: ${onboarding.deadlineAt.toISOString().slice(0, 10)}`
                            : t(locale, "staffOnboardingNone")}
                      </p>
                      {canSkipStaffOnboarding && (!onboarding || !onboarding.completedAt) ? (
                        <form action={skipMemberOnboardingAction} className="mt-3">
                          {onboarding ? <input type="hidden" name="onboardingId" value={onboarding.id} /> : null}
                          {!onboarding ? <input type="hidden" name="userId" value={target.id} /> : null}
                          {!onboarding ? <input type="hidden" name="companyId" value={m.companyId} /> : null}
                          <FormSubmitButton type="submit" variant="secondary" className="h-8 text-xs">
                            {t(locale, "staffOnboardingSkipBtn")}
                          </FormSubmitButton>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                  {canManageThisCompanyMembership ? (
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
                  {canManageThisCompanyMembership ? (
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
                  {canManageThisCompanyMembership ? (
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
              );
            })}
            {!target.companyMemberships.length ? (
              <li className="text-[hsl(var(--muted))]">{t(locale, "projNone")}</li>
            ) : null}
          </ul>
        </Card>
        <Card className="p-4">
          <CardTitle>{t(locale, "projProjectMemberships")}</CardTitle>
          <ul className="mt-2 space-y-2 text-sm">
            {target.projectMemberships.map((m) => {
              const canManageThisProjectMembership = manageableProjectIds.has(m.projectId);
              return (
                <li key={m.id} className="space-y-2 rounded-md border border-[hsl(var(--border))] p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <Link className="hover:underline" href={`/projects/${m.projectId}`}>
                        {m.project.company.name} · {m.project.name}
                      </Link>{" "}
                      — {m.roleDefinition.displayName}
                    </span>
                    {canManageThisProjectMembership ? (
                      <form action={removeProjectMembershipAction}>
                        <input type="hidden" name="userId" value={target.id} />
                        <input type="hidden" name="projectId" value={m.projectId} />
                        <FormSubmitButton type="submit" variant="secondary" className="h-7 px-2 text-xs">
                          {t(locale, "btnRemove")}
                        </FormSubmitButton>
                      </form>
                    ) : null}
                  </div>
                  {canManageThisProjectMembership ? (
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
              );
            })}
            {!target.projectMemberships.length ? (
              <li className="text-[hsl(var(--muted))]">{t(locale, "projNone")}</li>
            ) : null}
          </ul>
        </Card>
      </section>
    </div>
  );
}
