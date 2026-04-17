import Link from "next/link";
import { RecognitionMode } from "@prisma/client";
import {
  createFeedbackEventAction,
  deleteFeedbackEventAction,
  updateFeedbackEventAction,
} from "@/app/actions/feedback";
import {
  createStaffRecognitionAction,
  deleteStaffRecognitionAction,
  updateStaffRecognitionAction,
} from "@/app/actions/recognition";
import { canManageProject, type AccessUser } from "@/lib/access";
import { displayFeedbackSecondary } from "@/lib/feedback-catalog";
import type { Locale } from "@/lib/locale";
import { t, tFeedbackCategory, tRecognitionMode, tRecognitionTagCategory } from "@/lib/messages";
import { displayRecognitionSecondary } from "@/lib/recognition-catalog";
import { FeedbackSecondarySelect } from "@/components/feedback-secondary-select";
import { FormSubmitButton } from "@/components/form-submit-button";
import { RecognitionSecondarySelect } from "@/components/recognition-secondary-select";
import { Card, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";

type ProjectChoice = {
  id: string;
  companyId: string;
  name: string;
  company: {
    name: string;
    orgGroupId?: string;
  };
};

type RecognitionRow = {
  id: string;
  toUserId: string;
  projectId: string | null;
  mode: RecognitionMode;
  tagCategory: Parameters<typeof displayRecognitionSecondary>[0];
  secondaryLabelKey: string;
  tagLabel: string | null;
  message: string | null;
  createdAt: Date;
  fromUser: { name: string | null } | null;
  project: ({ id: string; name: string; company: { name: string; orgGroupId: string } } & ProjectChoice) | null;
};

type FeedbackRow = {
  id: string;
  toUserId: string;
  projectId: string | null;
  category: Parameters<typeof displayFeedbackSecondary>[0];
  secondaryLabelKey: string;
  message: string | null;
  createdAt: Date;
  fromUser: { name: string | null } | null;
  project: ({ id: string; name: string; company: { name: string; orgGroupId: string } } & ProjectChoice) | null;
};

type Props = {
  actor: AccessUser;
  locale: Locale;
  targetUserId: string;
  projectChoices: ProjectChoice[];
  recognitions: RecognitionRow[];
  feedback: FeedbackRow[];
  canCreateRecognition: boolean;
  canCreateFeedback: boolean;
  canViewFeedback: boolean;
  canManageFeedbackWithoutProject: boolean;
};

const noteClassName =
  "min-h-24 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[hsl(var(--accent))] focus:ring-2";
const createTriggerClassName =
  "block cursor-pointer list-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-sm font-medium text-[hsl(var(--foreground))] transition hover:bg-black/[0.03] dark:hover:bg-white/[0.03] [&::marker]:content-[''] [&::-webkit-details-marker]:hidden";

function withProjectChoice(projectChoices: ProjectChoice[], project: ProjectChoice | null) {
  if (!project || projectChoices.some((choice) => choice.id === project.id)) return projectChoices;
  return [project, ...projectChoices];
}

export function StaffObservationsPanel({
  actor,
  locale,
  targetUserId,
  projectChoices,
  recognitions,
  feedback,
  canCreateRecognition,
  canCreateFeedback,
  canViewFeedback,
  canManageFeedbackWithoutProject,
}: Props) {
  const showGrowthContext = canViewFeedback || canCreateFeedback;
  const recognitionItems = recognitions.map((item) => ({
    createdAt: item.createdAt,
    kind: "recognition" as const,
    canManage: !!item.project && canCreateRecognition && canManageProject(actor, item.project),
    item,
  }));
  const feedbackItems = (canViewFeedback ? feedback : []).map((item) => ({
    createdAt: item.createdAt,
    kind: "feedback" as const,
    canManage: item.project
      ? canCreateFeedback && canManageProject(actor, item.project)
      : canCreateFeedback && canManageFeedbackWithoutProject,
    item,
  }));

  const timeline = [...recognitionItems, ...feedbackItems].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const canCreateAny = actor.id !== targetUserId && projectChoices.length > 0 && (canCreateRecognition || canCreateFeedback);

  return (
    <Card className="space-y-4 p-4">
      <div className="space-y-1">
        <CardTitle>{t(locale, showGrowthContext ? "staffObservationsTitle" : "staffRecognitionOnlyTitle")}</CardTitle>
        {showGrowthContext ? (
          <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "staffObservationsHint")}</p>
        ) : null}
      </div>

      {canCreateAny ? (
        <div className="grid gap-4 rounded-xl border border-[hsl(var(--border))] bg-black/[0.02] p-4 dark:bg-white/[0.02] lg:grid-cols-2">
          {canCreateRecognition ? (
            <details className="space-y-3">
              <summary className={createTriggerClassName}>{t(locale, "staffObservationAddRecognition")}</summary>
              <div className="mt-3 space-y-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "staffObservationAddRecognitionHint")}</p>
                <form action={createStaffRecognitionAction} className="grid gap-2">
                  <input type="hidden" name="toUserId" value={targetUserId} />
                  <div className="space-y-1">
                    <label className="text-xs font-medium">{t(locale, "projProjectContext")}</label>
                    <Select name="projectId" required>
                      {projectChoices.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.company.name} · {project.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <RecognitionSecondarySelect defaultCategory="COLLABORATION" locale={locale} />
                  <div className="space-y-1">
                    <label className="text-xs font-medium">{t(locale, "projRecIdentity")}</label>
                    <Select name="mode" defaultValue={RecognitionMode.PUBLIC}>
                      <option value={RecognitionMode.PUBLIC}>{tRecognitionMode(locale, RecognitionMode.PUBLIC)}</option>
                      <option value={RecognitionMode.SEMI_ANONYMOUS}>
                        {tRecognitionMode(locale, RecognitionMode.SEMI_ANONYMOUS)}
                      </option>
                      <option value={RecognitionMode.ANONYMOUS}>{tRecognitionMode(locale, RecognitionMode.ANONYMOUS)}</option>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">{t(locale, "projRecComment")}</label>
                    <textarea name="message" className={noteClassName} placeholder={t(locale, "projRecCommentPh")} />
                  </div>
                  <FormSubmitButton type="submit" variant="secondary">
                    {t(locale, "staffObservationAddRecognition")}
                  </FormSubmitButton>
                </form>
              </div>
            </details>
          ) : null}

          {canCreateFeedback ? (
            <details className="space-y-3">
              <summary className={createTriggerClassName}>{t(locale, "staffObservationAddGrowth")}</summary>
              <div className="mt-3 space-y-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "staffObservationAddGrowthHint")}</p>
                <form action={createFeedbackEventAction} className="grid gap-2">
                  <input type="hidden" name="toUserId" value={targetUserId} />
                  <div className="space-y-1">
                    <label className="text-xs font-medium">{t(locale, "projProjectContext")}</label>
                    <Select name="projectId" required>
                      {projectChoices.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.company.name} · {project.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <FeedbackSecondarySelect defaultCategory="COMMUNICATION" locale={locale} />
                  <div className="space-y-1">
                    <label className="text-xs font-medium">{t(locale, "projGrowthNote")}</label>
                    <textarea
                      name="message"
                      className={noteClassName}
                      placeholder={t(locale, "staffObservationGrowthPlaceholder")}
                    />
                  </div>
                  <FormSubmitButton type="submit" variant="secondary">
                    {t(locale, "staffObservationAddGrowth")}
                  </FormSubmitButton>
                </form>
              </div>
            </details>
          ) : null}
        </div>
      ) : actor.id !== targetUserId && (canCreateRecognition || canCreateFeedback) ? (
        <p className="rounded-lg border border-dashed border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--muted))]">
          {t(locale, "staffObservationNoProjectContext")}
        </p>
      ) : null}

      {timeline.length ? (
        <ul className="space-y-3 text-sm">
          {timeline.map((entry) =>
            entry.kind === "recognition" ? (
              <RecognitionTimelineItem
                key={`recognition-${entry.item.id}`}
                item={entry.item}
                locale={locale}
                projectChoices={projectChoices}
                canManage={entry.canManage}
              />
            ) : (
              <FeedbackTimelineItem
                key={`feedback-${entry.item.id}`}
                item={entry.item}
                locale={locale}
                projectChoices={projectChoices}
                canManage={entry.canManage}
              />
            ),
          )}
        </ul>
      ) : (
        <p className="text-sm text-[hsl(var(--muted))]">
          {t(locale, showGrowthContext ? "staffObservationsEmpty" : "staffRecEmpty")}
        </p>
      )}
    </Card>
  );
}

function RecognitionTimelineItem({
  item,
  locale,
  projectChoices,
  canManage,
}: {
  item: RecognitionRow;
  locale: Locale;
  projectChoices: ProjectChoice[];
  canManage: boolean;
}) {
  const editProjectChoices = withProjectChoice(projectChoices, item.project);

  return (
    <li className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
          {t(locale, "staffObservationTypeRecognition")}
        </span>
        <div className="font-semibold text-[hsl(var(--foreground))]">
          {item.secondaryLabelKey
            ? displayRecognitionSecondary(item.tagCategory, item.secondaryLabelKey, locale)
            : (item.tagLabel ?? tRecognitionTagCategory(locale, item.tagCategory))}
        </div>
      </div>
      <div className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted))]">
        {tRecognitionTagCategory(locale, item.tagCategory)}
        {" · "}
        {item.project ? (
          <Link className="font-medium text-[hsl(var(--foreground))] underline-offset-2 hover:underline" href={`/projects/${item.project.id}`}>
            {item.project.name}
          </Link>
        ) : (
          t(locale, "kbUncategorizedShort")
        )}
        {" · "}
        {t(locale, "projRecBy")} {item.fromUser?.name ?? t(locale, "staffRecFromTeammate")}
        {" · "}
        {tRecognitionMode(locale, item.mode)}
        {" · "}
        {t(locale, "staffRecWhen")} {item.createdAt.toISOString().slice(0, 10)}
      </div>
      {item.message ? <p className="mt-2 whitespace-pre-wrap text-sm text-[hsl(var(--foreground))]">{item.message}</p> : null}

      {canManage ? (
        <details className="mt-3 rounded-lg border border-[hsl(var(--border))] bg-black/[0.02] p-3 dark:bg-white/[0.02]">
          <summary className="cursor-pointer text-xs font-medium text-[hsl(var(--foreground))]">
            {t(locale, "staffObservationManage")}
          </summary>
          <div className="mt-3 space-y-3">
            <form action={updateStaffRecognitionAction} className="grid gap-2">
              <input type="hidden" name="recognitionId" value={item.id} />
              <input type="hidden" name="toUserId" value={item.toUserId} />
              <div className="space-y-1">
                <label className="text-xs font-medium">{t(locale, "projProjectContext")}</label>
                <Select name="projectId" required defaultValue={item.projectId ?? editProjectChoices[0]?.id}>
                  {editProjectChoices.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.company.name} · {project.name}
                    </option>
                  ))}
                </Select>
              </div>
              <RecognitionSecondarySelect
                defaultCategory={item.tagCategory}
                defaultSecondaryKey={item.secondaryLabelKey}
                locale={locale}
              />
              <div className="space-y-1">
                <label className="text-xs font-medium">{t(locale, "projRecIdentity")}</label>
                <Select name="mode" defaultValue={item.mode}>
                  <option value={RecognitionMode.PUBLIC}>{tRecognitionMode(locale, RecognitionMode.PUBLIC)}</option>
                  <option value={RecognitionMode.SEMI_ANONYMOUS}>
                    {tRecognitionMode(locale, RecognitionMode.SEMI_ANONYMOUS)}
                  </option>
                  <option value={RecognitionMode.ANONYMOUS}>{tRecognitionMode(locale, RecognitionMode.ANONYMOUS)}</option>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">{t(locale, "projRecComment")}</label>
                <textarea name="message" className={noteClassName} defaultValue={item.message ?? ""} />
              </div>
              <div className="flex flex-wrap gap-2">
                <FormSubmitButton type="submit" variant="secondary">
                  {t(locale, "staffObservationSaveChanges")}
                </FormSubmitButton>
              </div>
            </form>
            <form action={deleteStaffRecognitionAction}>
              <input type="hidden" name="recognitionId" value={item.id} />
              <FormSubmitButton type="submit" variant="ghost" className="px-0 text-rose-600 hover:text-rose-700 dark:text-rose-300">
                {t(locale, "staffObservationDelete")}
              </FormSubmitButton>
            </form>
          </div>
        </details>
      ) : null}
    </li>
  );
}

function FeedbackTimelineItem({
  item,
  locale,
  projectChoices,
  canManage,
}: {
  item: FeedbackRow;
  locale: Locale;
  projectChoices: ProjectChoice[];
  canManage: boolean;
}) {
  const editProjectChoices = withProjectChoice(projectChoices, item.project);

  return (
    <li className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
          {t(locale, "staffObservationTypeGrowth")}
        </span>
        <div className="font-semibold text-[hsl(var(--foreground))]">
          {displayFeedbackSecondary(item.category, item.secondaryLabelKey, locale)}
        </div>
      </div>
      <div className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted))]">
        {tFeedbackCategory(locale, item.category)}
        {" · "}
        {item.project ? (
          <Link className="font-medium text-[hsl(var(--foreground))] underline-offset-2 hover:underline" href={`/projects/${item.project.id}`}>
            {item.project.name}
          </Link>
        ) : (
          t(locale, "staffFbProjectFallback")
        )}
        {" · "}
        {t(locale, "projRecBy")} {item.fromUser?.name ?? t(locale, "staffRecFromTeammate")}
        {" · "}
        {t(locale, "staffRecWhen")} {item.createdAt.toISOString().slice(0, 10)}
      </div>
      {item.message ? <p className="mt-2 whitespace-pre-wrap text-sm text-[hsl(var(--foreground))]">{item.message}</p> : null}

      {canManage ? (
        <details className="mt-3 rounded-lg border border-[hsl(var(--border))] bg-black/[0.02] p-3 dark:bg-white/[0.02]">
          <summary className="cursor-pointer text-xs font-medium text-[hsl(var(--foreground))]">
            {t(locale, "staffObservationManage")}
          </summary>
          <div className="mt-3 space-y-3">
            <form action={updateFeedbackEventAction} className="grid gap-2">
              <input type="hidden" name="feedbackId" value={item.id} />
              <div className="space-y-1">
                <label className="text-xs font-medium">{t(locale, "projProjectContext")}</label>
                <Select name="projectId" required defaultValue={item.projectId ?? editProjectChoices[0]?.id}>
                  {editProjectChoices.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.company.name} · {project.name}
                    </option>
                  ))}
                </Select>
              </div>
              <FeedbackSecondarySelect
                defaultCategory={item.category}
                defaultSecondaryKey={item.secondaryLabelKey}
                locale={locale}
              />
              <div className="space-y-1">
                <label className="text-xs font-medium">{t(locale, "projGrowthNote")}</label>
                <textarea name="message" className={noteClassName} defaultValue={item.message ?? ""} />
              </div>
              <div className="flex flex-wrap gap-2">
                <FormSubmitButton type="submit" variant="secondary">
                  {t(locale, "staffObservationSaveChanges")}
                </FormSubmitButton>
              </div>
            </form>
            <form action={deleteFeedbackEventAction}>
              <input type="hidden" name="feedbackId" value={item.id} />
              <FormSubmitButton type="submit" variant="ghost" className="px-0 text-rose-600 hover:text-rose-700 dark:text-rose-300">
                {t(locale, "staffObservationDelete")}
              </FormSubmitButton>
            </form>
          </div>
        </details>
      ) : null}
    </li>
  );
}
