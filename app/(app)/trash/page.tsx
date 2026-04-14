import Link from "next/link";
import { redirect } from "next/navigation";
import {
  purgeCompanyAction,
  purgeProjectAction,
  purgeUserAction,
  restoreCompanyTrashAction,
  restoreProjectTrashAction,
  restoreUserAction,
} from "@/app/actions/trash";
import { restoreAttachmentTrashAction } from "@/app/actions/attachment-trash";
import { requireUser } from "@/lib/auth";
import type { AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";

export default async function TrashPage() {
  const user = (await requireUser()) as AccessUser;
  if (!(await userHasPermission(user, "trash.read"))) redirect("/group");

  const locale = await getLocale();
  const canRestore = await userHasPermission(user, "trash.restore");
  const canPurge = await userHasPermission(user, "trash.purge");

  const [deletedUsers, deletedCompanies, deletedProjects, deletedAttachments] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.company.findMany({
      where: { deletedAt: { not: null } },
      include: { orgGroup: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.project.findMany({
      where: { deletedAt: { not: null } },
      include: { company: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.attachment.findMany({
      where: {
        deletedAt: { not: null },
        ...(user.isSuperAdmin ? {} : { uploadedById: user.id }),
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
  ]);

  return (
    <div className="space-y-8">
      <div className="text-xs text-[hsl(var(--muted))]">
        <Link href="/group">{t(locale, "breadcrumbGroup")}</Link> / {t(locale, "breadcrumbTrash")}
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t(locale, "trashTitle")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-[hsl(var(--muted))]">{t(locale, "trashSubtitle")}</p>
      </div>

      <Card className="space-y-3 p-4">
        <CardTitle>{t(locale, "trashUsers")}</CardTitle>
        {deletedUsers.length ? (
          <ul className="space-y-2 text-sm">
            {deletedUsers.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[hsl(var(--border))] px-3 py-2">
                <div>
                  <span className="font-medium">{u.name}</span>
                  <span className="ml-2 text-xs text-[hsl(var(--muted))]">{u.email}</span>
                </div>
                <div className="flex gap-2">
                  {canRestore ? (
                    <form action={restoreUserAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <Button type="submit" className="h-8 px-2 text-xs" variant="secondary">
                        {t(locale, "btnRestore")}
                      </Button>
                    </form>
                  ) : null}
                  {canPurge ? (
                    <form action={purgeUserAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <Button
                        type="submit"
                        className="h-8 border border-rose-600/40 bg-rose-600/10 px-2 text-xs text-rose-800 dark:text-rose-100"
                        variant="secondary"
                      >
                        {t(locale, "btnPurge")}
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "trashNoUsers")}</p>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <CardTitle>{t(locale, "trashCompanies")}</CardTitle>
        {deletedCompanies.length ? (
          <ul className="space-y-2 text-sm">
            {deletedCompanies.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[hsl(var(--border))] px-3 py-2">
                <div>
                  <span className="font-medium">{c.name}</span>
                  <span className="ml-2 text-xs text-[hsl(var(--muted))]">{c.orgGroup.name}</span>
                </div>
                <div className="flex gap-2">
                  {canRestore ? (
                    <form action={restoreCompanyTrashAction}>
                      <input type="hidden" name="companyId" value={c.id} />
                      <Button type="submit" className="h-8 px-2 text-xs" variant="secondary">
                        {t(locale, "btnRestore")}
                      </Button>
                    </form>
                  ) : null}
                  {canPurge ? (
                    <form action={purgeCompanyAction}>
                      <input type="hidden" name="companyId" value={c.id} />
                      <Button
                        type="submit"
                        className="h-8 border border-rose-600/40 bg-rose-600/10 px-2 text-xs text-rose-800 dark:text-rose-100"
                        variant="secondary"
                      >
                        {t(locale, "btnPurge")}
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "trashNoCompanies")}</p>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <CardTitle>{t(locale, "trashProjects")}</CardTitle>
        {deletedProjects.length ? (
          <ul className="space-y-2 text-sm">
            {deletedProjects.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[hsl(var(--border))] px-3 py-2">
                <div>
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-2 text-xs text-[hsl(var(--muted))]">{p.company.name}</span>
                </div>
                <div className="flex gap-2">
                  {canRestore ? (
                    <form action={restoreProjectTrashAction}>
                      <input type="hidden" name="projectId" value={p.id} />
                      <Button type="submit" className="h-8 px-2 text-xs" variant="secondary">
                        {t(locale, "btnRestore")}
                      </Button>
                    </form>
                  ) : null}
                  {canPurge ? (
                    <form action={purgeProjectAction}>
                      <input type="hidden" name="projectId" value={p.id} />
                      <Button
                        type="submit"
                        className="h-8 border border-rose-600/40 bg-rose-600/10 px-2 text-xs text-rose-800 dark:text-rose-100"
                        variant="secondary"
                      >
                        {t(locale, "btnPurge")}
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "trashNoProjects")}</p>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <CardTitle>{t(locale, "attTrashTitle")}</CardTitle>
        {deletedAttachments.length ? (
          <ul className="space-y-2 text-sm">
            {deletedAttachments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[hsl(var(--border))] px-3 py-2">
                <div>
                  <span className="font-medium">{a.fileName}</span>
                  <span className="ml-2 text-xs text-[hsl(var(--muted))]">{a.createdAt.toISOString().slice(0, 10)}</span>
                </div>
                {canRestore ? (
                  <form action={restoreAttachmentTrashAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <Button type="submit" className="h-8 px-2 text-xs" variant="secondary">
                      {t(locale, "attRestore")}
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "attTrashEmpty")}</p>
        )}
      </Card>
    </div>
  );
}
