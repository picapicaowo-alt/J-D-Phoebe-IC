import Link from "next/link";
import { notFound } from "next/navigation";
import { createFeedbackEventAction } from "@/app/actions/feedback";
import { requireUser } from "@/lib/auth";
import { canManageProject, canViewProject, type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FeedbackSecondarySelect } from "@/components/feedback-secondary-select";

export default async function ProjectGrowthPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = (await requireUser()) as AccessUser;
  const { projectId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: {
      company: true,
      memberships: { include: { user: true } },
    },
  });
  if (!project || !canViewProject(user, project)) notFound();

  const locale = await getLocale();
  const canManage = canManageProject(user, project);
  const canFeedback = (await userHasPermission(user, "feedback.submit")) && canManage;

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
        {t(locale, "projGrowthOpen")}
      </div>

      {canFeedback ? (
        <Card className="space-y-3 p-4">
          <CardTitle>{t(locale, "projGrowthCard")}</CardTitle>
          <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "projGrowthCardIntro")}</p>
          <form action={createFeedbackEventAction} className="grid gap-2 md:grid-cols-2">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "projFeedAboutMember")}</label>
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
              <FeedbackSecondarySelect defaultCategory="COMMUNICATION" locale={locale} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">{t(locale, "projGrowthNote")}</label>
              <Input name="message" placeholder={t(locale, "projFeedPlaceholder")} />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" variant="secondary">
                {t(locale, "projFeedRecordBtn")}
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card className="space-y-2 p-4">
          <CardTitle>{t(locale, "projGrowthCard")}</CardTitle>
          <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "projGrowthReadOnly")}</p>
        </Card>
      )}

      <Link href={`/projects/${project.id}`}>
        <Button type="button" variant="secondary">
          ← {t(locale, "projBreadcrumbProjects")} / {project.name}
        </Button>
      </Link>
    </div>
  );
}
