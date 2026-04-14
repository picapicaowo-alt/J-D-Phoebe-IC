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
import {
  createMemberOutputWithAttachmentAction,
  updateMemberOutputMetaAction,
  uploadMemberOutputVersionAction,
} from "@/app/actions/member-output";
import { requireUser } from "@/lib/auth";
import { canViewProject, isSuperAdmin, type AccessUser } from "@/lib/access";
import { getLocale } from "@/lib/locale";
import { t, tRecognitionTagCategory } from "@/lib/messages";
import { tLedgerReason } from "@/lib/ledger-labels";
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
import { AttachmentVersionTree } from "@/components/attachment-version-tree";

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

      <h1 className="text-2xl font-semibold tracking-tight">{target.name}</h1>

      {canEditProfile ? (
        <Card className="space-y-4 p-4">
          <CardTitle>{t(locale, "staffProfile")}</CardTitle>
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
            {isSuperAdmin(actor) ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={target.active} />
                {t(locale, "staffActive")}
              </label>
            ) : null}
            <Button type="submit">{t(locale, "staffSave")}</Button>
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
          {actor.id === target.id ? (
            <form action={updateCompanionAction} className="mt-2 flex flex-wrap items-end gap-2 border-t pt-2">
              <div className="space-y-1">
                <label className="text-xs font-medium">{t(locale, "staffSpecies")}</label>
                <Select name="species" defaultValue={target.companionProfile?.species ?? "BUNNY"}>
                  {getCompanionManifest().map((e) => (
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
              <Button type="submit" variant="secondary" className="h-9 text-xs">
                {t(locale, "staffSaveCompanion")}
              </Button>
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
                    <form
                      action={uploadMemberOutputVersionAction}
                      encType="multipart/form-data"
                      className="grid gap-2 md:grid-cols-2"
                    >
                      <input type="hidden" name="memberOutputId" value={mo.id} />
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-xs font-medium">{t(locale, "staffMoUploadVersion")}</label>
                        <Input type="file" name="file" required className="text-xs" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">{t(locale, "commonTitleEn")}</label>
                        <Input name="titleEn" className="text-xs" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">{t(locale, "commonTitleZh")}</label>
                        <Input name="titleZh" className="text-xs" />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-xs font-medium">{t(locale, "commonDescription")}</label>
                        <Input name="description" className="text-xs" />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-xs font-medium">{t(locale, "commonLabels")}</label>
                        <Input name="labels" className="text-xs" />
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
                        <Button type="submit" variant="secondary" className="h-8 text-xs">
                          {t(locale, "btnUpload")}
                        </Button>
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
                        <Button type="submit" variant="secondary" className="h-8 text-xs">
                          {t(locale, "btnSave")}
                        </Button>
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
          <form
            action={createMemberOutputWithAttachmentAction}
            encType="multipart/form-data"
            className="grid gap-2 border-t border-[hsl(var(--border))] pt-3 md:grid-cols-2"
          >
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
              <label className="text-xs font-medium">
                {t(locale, "btnUpload")} ({t(locale, "commonOptional")})
              </label>
              <Input type="file" name="file" className="text-xs" />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" variant="secondary" className="h-8 text-xs">
                {t(locale, "staffMoCreate")}
              </Button>
            </div>
          </form>
        ) : null}
      </Card>

      <Card className="space-y-3 p-4">
        <CardTitle>{t(locale, "staffRecReceived")}</CardTitle>
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
                  {tRecognitionTagCategory(locale, r.tagCategory)} · {r.project?.name ?? t(locale, "kbUncategorizedShort")} ·{" "}
                  {t(locale, "projRecBy")}{" "}
                  {r.fromUser?.name ?? t(locale, "staffRecFromTeammate")}
                </div>
                {r.message ? <p className="mt-1 text-sm">{r.message}</p> : null}
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
              <Button type="submit" variant="secondary">{t(locale, "projSaveObservation")}</Button>
            </div>
          </form>
        </Card>
      ) : null}

      {(actor.id === target.id || (await userHasPermission(actor, "feedback.read"))) && target.feedbackReceived.length ? (
        <Card className="space-y-3 p-4">
          <CardTitle>{t(locale, "staffGrowthOnFile")}</CardTitle>
          <ul className="space-y-2 text-sm">
            {target.feedbackReceived.map((f) => (
              <li key={f.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
                <div className="text-xs text-[hsl(var(--muted))]">
                  {f.project?.name ?? t(locale, "staffFbProjectFallback")} · {f.createdAt.toISOString().slice(0, 10)}
                </div>
                {f.message ? <p className="mt-1">{f.message}</p> : null}
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
            <Select name="roleDefinitionId" required className="min-w-[200px]">
              {companyRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.displayName}
                </option>
              ))}
            </Select>
            <Button type="submit">{t(locale, "projAssignBtn")}</Button>
          </form>
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
            <Button type="submit">{t(locale, "projAssignBtn")}</Button>
          </form>
        </Card>
      ) : null}

      {canSoftDelete ? (
        <Card className="border-rose-600/20 p-4">
          <CardTitle>{t(locale, "projDangerSoftDelete")}</CardTitle>
          <p className="mt-1 text-xs text-[hsl(var(--muted))]">{t(locale, "projSoftDeleteHint")}</p>
          <form action={softDeleteUserAction} className="mt-3">
            <input type="hidden" name="userId" value={target.id} />
            <Button type="submit" variant="secondary" className="border border-rose-600/40 bg-rose-600/10 text-rose-900 dark:text-rose-100">
              {t(locale, "projMoveUserTrash")}
            </Button>
          </form>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <CardTitle>{t(locale, "projCompanyMemberships")}</CardTitle>
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
                      {t(locale, "btnRemove")}
                    </Button>
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
                    <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                      {t(locale, "btnRemove")}
                    </Button>
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
