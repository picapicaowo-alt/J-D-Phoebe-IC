import Link from "next/link";
import { notFound } from "next/navigation";
import { RecognitionMode } from "@prisma/client";
import { createRecognitionAction } from "@/app/actions/recognition";
import { requireUser } from "@/lib/auth";
import { canViewProject, type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { t, tRecognitionMode, tRecognitionTagCategory } from "@/lib/messages";
import { displayRecognitionSecondary } from "@/lib/recognition-catalog";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { RecognitionSecondarySelect } from "@/components/recognition-secondary-select";

export default async function ProjectRecognitionPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = (await requireUser()) as AccessUser;
  const { projectId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: {
      company: true,
      memberships: { include: { user: true } },
      knowledgeAssets: { where: { deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 40 },
      recognitions: {
        include: { toUser: true, fromUser: true },
        orderBy: { createdAt: "desc" },
        take: 40,
      },
    },
  });
  if (!project || !canViewProject(user, project)) notFound();

  const locale = await getLocale();
  const canRecognize = await userHasPermission(user, "recognition.create");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="text-xs text-[hsl(var(--muted))]">
        <Link href="/projects" className="hover:underline">
          {t(locale, "projBreadcrumbProjects")}
        </Link>
        <span> / </span>
        <Link href={`/projects/${project.id}`} className="hover:underline">
          {project.name}
        </Link>
        <span> / </span>
        {t(locale, "projRecognitionOpen")}
      </div>

      <Card className="space-y-3 p-4">
        <CardTitle>{t(locale, "projRecognitionWall")}</CardTitle>
        {canRecognize ? (
          <form action={createRecognitionAction} className="mb-3 grid gap-2 border-b pb-3 md:grid-cols-2">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "projRecToMember")}</label>
              <Select name="toUserId" required>
                <option value="">{t(locale, "commonSelectMember")}</option>
                {project.memberships.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.user.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="md:col-span-2">
              <RecognitionSecondarySelect defaultCategory="COLLABORATION" locale={locale} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "projRecLinkKnowledge")}</label>
              <Select name="knowledgeAssetId">
                <option value="">—</option>
                {project.knowledgeAssets.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.title}
                  </option>
                ))}
              </Select>
            </div>
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
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">{t(locale, "projRecComment")}</label>
              <Input name="message" placeholder={t(locale, "projRecCommentPh")} />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" variant="secondary">
                {t(locale, "projRecSend")}
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "projRecSubmitForbidden")}</p>
        )}

        {project.recognitions.length ? (
          <ul className="space-y-2 text-sm">
            {project.recognitions.map((r) => (
              <li key={r.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
                <div className="font-medium">
                  {r.secondaryLabelKey
                    ? displayRecognitionSecondary(r.tagCategory, r.secondaryLabelKey, locale)
                    : (r.tagLabel ?? r.secondaryLabelKey)}
                </div>
                <div className="text-xs text-[hsl(var(--muted))]">
                  {tRecognitionTagCategory(locale, r.tagCategory)} · {t(locale, "projRecTo")} {r.toUser.name} ·{" "}
                  {t(locale, "projRecBy")} {r.fromUser?.name ?? t(locale, "projRecAnonymous")}
                </div>
                {r.message ? <p className="mt-1 text-sm">{r.message}</p> : null}
              </li>
            ))}
          </ul>
        ) : canRecognize ? (
          <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "projRecEmpty")}</p>
        ) : null}
      </Card>

      <Link href={`/projects/${project.id}`}>
        <Button type="button" variant="secondary">
          ← {t(locale, "projBreadcrumbProjects")} / {project.name}
        </Button>
      </Link>
    </div>
  );
}
