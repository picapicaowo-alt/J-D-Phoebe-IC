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
  updateCompanyMembershipDepartmentAction,
  updateCompanyMembershipSupervisorAction,
  updateStaffAction,
} from "@/app/actions/staff";
import {
  completeOffboardingRunAction,
  startOffboardingRunAction,
  toggleOffboardingChecklistAction,
} from "@/app/actions/lifecycle";
import { removeUserAvatarAction, uploadUserAvatarAction } from "@/app/actions/profile-media";
import { addExternalResourceLinkAction } from "@/app/actions/attachments";
import { createMemberOutputWithAttachmentAction, updateMemberOutputMetaAction } from "@/app/actions/member-output";
import { requireUser } from "@/lib/auth";
import { canViewProject, isSuperAdmin, type AccessUser } from "@/lib/access";
import { getLocale } from "@/lib/locale";
import { t, tFeedbackCategory, tRecognitionTagCategory } from "@/lib/messages";
import { tLedgerReason } from "@/lib/ledger-labels";
import { displayRecognitionSecondary } from "@/lib/recognition-catalog";
import { displayFeedbackSecondary } from "@/lib/feedback-catalog";
import { getCompanionManifest, getCompanionManifestForUser } from "@/lib/companion-manifest";
import { sumAbilityByUser } from "@/lib/scoring";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AbilityRadar } from "@/components/ability-radar";
import { UserFace } from "@/components/user-face";
import { FeedbackSecondarySelect } from "@/components/feedback-secondary-select";
import { AttachmentVersionTree } from "@/components/attachment-version-tree";

export default async function StaffDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const actor = (await requireUser()) as AccessUser;
  const { userId } = await params;

  const target = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: {
      groupMemberships: { include: { roleDefinition: true, orgGroup: true } },
      companyMemberships: { include: { company: true, roleDefinition: true, department: true, supervisor: true } },
      projectMemberships: { include: { project: { include: { company: true } }, roleDefinition: true } },
      companionProfile: true,
      performanceSnapshots: { orderBy: { createdAt: "desc" }, take: 1 },
      recognitionsReceived: {
        include: { fromUser: true, project: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      feedbackReceived: {
        include: { fromUser: true, project: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
  if (!target) notFound();

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
  });

  const canSoftDelete =
    (await userHasPermission(actor, "staff.soft_delete")) &&
    (isSuperAdmin(actor) || isAnyGroupAdmin) &&
    actor.id !== target.id &&
    !(target.isSuperAdmin && !isSuperAdmin(actor));

  const memberOutputs = await prisma.memberOutput.findMany({
    where: { userId: target.id, deletedAt: null },
    include: {
      attachments: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      project: true,
    },
    orderBy: { updatedAt: "desc" },
  });

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
            <form action={uploadUserAvatarAction} encType="multipart/form-data" className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="userId" value={target.id} />
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

      <Card className="space-y-4 p-4">
        <CardTitle>{t(locale, "staffMemberOutput")}</CardTitle>
        <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "staffMemberOutputCaption")}</p>
        {memberOutputs.length ? (
          <ul className="space-y-4 text-sm">
            {memberOutputs.map((mo) => (
              <li key={mo.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
                <div className="font-medium">{mo.title}</div>
                <div className="text-xs text-[hsl(var(--muted))]">
                  {[mo.titleEn, mo.titleZh].filter(Boolean).join(" · ")}
                  {mo.project ? ` · ${mo.project.name}` : ""}
                </div>
                {mo.description ? <p className="mt-1 text-xs">{mo.description}</p> : null}
                {mo.labels ? (
                  <p className="mt-1 text-xs text-[hsl(var(--muted))]">{mo.labels}</p>
                ) : null}
                {mo.attachments.length ? (
                  <div className="mt-2 text-xs">
                    <AttachmentVersionTree
                      attachments={mo.attachments.map((f) => ({
                        id: f.id,
                        previousVersionId: f.previousVersionId,
                        fileName: f.fileName,
                        createdAt: f.createdAt,
                        resourceKind: f.resourceKind,
                        externalUrl: f.externalUrl,
                      }))}
                      locale={locale}
                      showTrash={canEditProfile}
                    />
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-[hsl(var(--muted))]">{t(locale, "wfNoFiles")}</p>
                )}
                {canEditProfile ? (
                  <div className="mt-3 space-y-3 border-t border-[hsl(var(--border))] pt-3">
                    <form action={addExternalResourceLinkAction} className="grid gap-2 md:grid-cols-2">
                      <input type="hidden" name="memberOutputId" value={mo.id} />
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-xs font-medium">{t(locale, "resExternalUrl")}</label>
                        <Input name="externalUrl" type="url" required placeholder="https://..." className="text-xs" />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-xs font-medium">{t(locale, "resLinkLabel")}</label>
                        <Input name="label" placeholder={t(locale, "resLinkLabelPh")} className="text-xs" />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-xs font-medium">{t(locale, "commonDescription")}</label>
                        <Input name="description" className="text-xs" />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-xs font-medium">{t(locale, "wfPrevVersion")}</label>
                        <select
                          name="previousVersionId"
                          className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-xs"
                          defaultValue=""
                        >
                          <option value="">{t(locale, "wfNewVersionNone")}</option>
                          {mo.attachments.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.fileName}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <FormSubmitButton type="submit" variant="secondary" className="h-8 text-xs">
                          {t(locale, "resAddLink")}
                        </FormSubmitButton>
                      </div>
                    </form>
                    <form action={updateMemberOutputMetaAction} className="grid gap-2 md:grid-cols-2">
                      <input type="hidden" name="id" value={mo.id} />
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-xs font-medium">{t(locale, "staffMoMeta")}</label>
                        <Input name="title" defaultValue={mo.title} required className="text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Input name="titleEn" placeholder={t(locale, "commonTitleEn")} defaultValue={mo.titleEn ?? ""} className="text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Input name="titleZh" placeholder={t(locale, "commonTitleZh")} defaultValue={mo.titleZh ?? ""} className="text-xs" />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <Input name="description" placeholder={t(locale, "commonDescription")} defaultValue={mo.description ?? ""} className="text-xs" />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <Input name="labels" placeholder={t(locale, "commonLabels")} defaultValue={mo.labels ?? ""} className="text-xs" />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <Select name="projectId" defaultValue={mo.projectId ?? ""}>
                          <option value="">{t(locale, "kbGeneralProject")}</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.company.name} · {p.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <Select name="companyId" defaultValue={mo.companyId ?? ""}>
                          <option value="">{t(locale, "kbInferCompany")}</option>
                          {companies.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="md:col-span-2">
                        <FormSubmitButton type="submit" variant="secondary" className="h-8 text-xs">
                          {t(locale, "btnSave")}
                        </FormSubmitButton>
                      </div>
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "wfNoFiles")}</p>
        )}
        {canEditProfile ? (
          <form action={createMemberOutputWithAttachmentAction} className="grid gap-2 border-t border-[hsl(var(--border))] pt-3 md:grid-cols-2">
            <input type="hidden" name="userId" value={target.id} />
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">{t(locale, "staffMoNewTitle")}</label>
              <Input name="title" required className="text-xs" />
            </div>
            <div className="space-y-1">
              <Input name="titleEn" placeholder={t(locale, "commonTitleEn")} className="text-xs" />
            </div>
            <div className="space-y-1">
              <Input name="titleZh" placeholder={t(locale, "commonTitleZh")} className="text-xs" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Input name="description" placeholder={t(locale, "commonDescription")} className="text-xs" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Input name="labels" placeholder={t(locale, "commonLabels")} className="text-xs" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Select name="projectId" defaultValue="">
                <option value="">{t(locale, "kbGeneralProject")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.company.name} · {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Select name="companyId" defaultValue="">
                <option value="">{t(locale, "kbInferCompany")}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">{t(locale, "resExternalUrl")}</label>
              <Input name="externalUrl" type="url" placeholder="https://drive.google.com/..." className="text-xs" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">{t(locale, "resLinkLabel")}</label>
              <Input name="linkLabel" placeholder={t(locale, "resLinkLabelPh")} className="text-xs" />
            </div>
            <div className="md:col-span-2">
              <FormSubmitButton type="submit" variant="secondary" className="h-8 text-xs">
                {t(locale, "staffMoCreate")}
              </FormSubmitButton>
            </div>
          </form>
        ) : null}
      </Card>

      <Card className="space-y-3 p-4">
        <CardTitle>{t(locale, "staffRecReceived")}</CardTitle>
        {target.recognitionsReceived.length ? (
          <ul className="space-y-3 text-sm">
            {target.recognitionsReceived.map((r) => (
              <li key={r.id} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 shadow-sm">
                <div className="font-semibold text-[hsl(var(--foreground))]">
                  {r.secondaryLabelKey
                    ? displayRecognitionSecondary(r.tagCategory, r.secondaryLabelKey, locale)
                    : (r.tagLabel ?? tRecognitionTagCategory(locale, r.tagCategory))}
                </div>
                <div className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted))]">
                  {tRecognitionTagCategory(locale, r.tagCategory)}
                  {" · "}
                  {r.project ? (
                    <Link className="font-medium text-[hsl(var(--foreground))] underline-offset-2 hover:underline" href={`/projects/${r.project.id}`}>
                      {r.project.name}
                    </Link>
                  ) : (
                    t(locale, "kbUncategorizedShort")
                  )}
                  {" · "}
                  {t(locale, "projRecBy")}{" "}
                  {r.fromUser?.name ?? t(locale, "staffRecFromTeammate")}
                  {" · "}
                  {t(locale, "staffRecWhen")}{" "}
                  {r.createdAt.toISOString().slice(0, 10)}
                </div>
                {r.message ? <p className="mt-2 text-sm text-[hsl(var(--foreground))]">{r.message}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "staffRecEmpty")}</p>
        )}
      </Card>

      {canFeedbackHere && actor.id !== target.id && feedbackProjectChoices.length ? (
        <Card className="space-y-3 p-4">
          <CardTitle>{t(locale, "staffGrowthAboutMember")}</CardTitle>
          <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "projGrowthHint")}</p>
          <form action={createFeedbackEventAction} className="grid gap-2 md:grid-cols-2">
            <input type="hidden" name="toUserId" value={target.id} />
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">{t(locale, "projProjectContext")}</label>
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
              <label className="text-xs font-medium">{t(locale, "projGrowthNote")}</label>
              <Input name="message" />
            </div>
            <div className="md:col-span-2">
              <FormSubmitButton type="submit" variant="secondary">
                {t(locale, "projSaveObservation")}
              </FormSubmitButton>
            </div>
          </form>
        </Card>
      ) : null}

      {(actor.id === target.id || (await userHasPermission(actor, "feedback.read"))) && target.feedbackReceived.length ? (
        <Card className="space-y-3 p-4">
          <CardTitle>{t(locale, "staffGrowthOnFile")}</CardTitle>
          <ul className="space-y-3 text-sm">
            {target.feedbackReceived.map((f) => (
              <li key={f.id} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 shadow-sm">
                <div className="font-semibold text-[hsl(var(--foreground))]">
                  {displayFeedbackSecondary(f.category, f.secondaryLabelKey, locale)}
                </div>
                <div className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted))]">
                  {tFeedbackCategory(locale, f.category)}
                  {" · "}
                  {f.project ? (
                    <Link className="font-medium text-[hsl(var(--foreground))] underline-offset-2 hover:underline" href={`/projects/${f.project.id}`}>
                      {f.project.name}
                    </Link>
                  ) : (
                    t(locale, "staffFbProjectFallback")
                  )}
                  {" · "}
                  {t(locale, "staffRecWhen")} {f.createdAt.toISOString().slice(0, 10)}
                  {f.fromUser ? (
                    <>
                      {" · "}
                      {t(locale, "projRecBy")} {f.fromUser.name}
                    </>
                  ) : null}
                </div>
                {f.message ? <p className="mt-2 text-sm text-[hsl(var(--foreground))]">{f.message}</p> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {canAssignCompanyUI ? (
        <Card className="space-y-3 p-4">
          <CardTitle>{t(locale, "staffAssignCompany")}</CardTitle>
          <form action={assignCompanyAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="userId" value={target.id} />
            <Select name="companyId" required className="min-w-[180px]">
              <option value="">{t(locale, "staffSelectCompany")}</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select name="departmentId" className="min-w-[200px]">
              <option value="">{t(locale, "projDeptGroupNone")}</option>
              {departmentsForStaffForms.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.company.name} / {d.name}
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
            <Select name="supervisorUserId" className="min-w-[200px]">
              <option value="">{t(locale, "staffSupervisorNone")}</option>
              {supervisorCandidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
            <FormSubmitButton type="submit">{t(locale, "projAssignBtn")}</FormSubmitButton>
          </form>
        </Card>
      ) : null}

      {canAssignCompanyUI ? (
        <Card className="space-y-3 p-4">
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
            <Select name="roleDefinitionId" required className="min-w-[200px]">
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

      {canSoftDelete ? (
        <Card className="border-rose-600/20 p-4">
          <CardTitle>{t(locale, "projDangerSoftDelete")}</CardTitle>
          <p className="mt-1 text-xs text-[hsl(var(--muted))]">{t(locale, "projSoftDeleteHint")}</p>
          <form action={softDeleteUserAction} className="mt-3">
            <input type="hidden" name="userId" value={target.id} />
            <FormSubmitButton type="submit" variant="secondary" className="border border-rose-600/40 bg-rose-600/10 text-rose-900 dark:text-rose-100">
              {t(locale, "projMoveUserTrash")}
            </FormSubmitButton>
          </form>
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
                    <FormSubmitButton type="submit" variant="secondary" className="h-7 px-2 text-xs">
                      {t(locale, "btnRemove")}
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
