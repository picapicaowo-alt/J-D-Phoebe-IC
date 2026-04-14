import Link from "next/link";
import { redirect } from "next/navigation";
import type { KnowledgeLayer } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import type { AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLocale } from "@/lib/locale";
import { t, tKnowledgeLayer } from "@/lib/messages";

const ORDER: KnowledgeLayer[] = [
  "TEMPLATE_PLAYBOOK",
  "REFERENCE_RESOURCE",
  "INTERNAL_INSIGHT",
  "REUSABLE_OUTPUT",
];

export default async function KnowledgeHubPage() {
  const user = (await requireUser()) as AccessUser;
  if (!(await userHasPermission(user, "knowledge.read"))) redirect("/home");
  const locale = await getLocale();
  const canCreate = await userHasPermission(user, "knowledge.create");

  const [projectCount, companyCount] = await Promise.all([
    prisma.project.count({ where: { deletedAt: null } }),
    prisma.company.count({ where: { deletedAt: null } }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t(locale, "knowledgeHubTitle")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-[hsl(var(--muted))]">{t(locale, "knowledgeHubSubtitle")}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3 p-4 lg:col-span-1">
          <CardTitle>{t(locale, "knowledgeSearch")}</CardTitle>
          <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "kbSearchLandingHint")}</p>
          <form action="/knowledge/browse" method="get" className="flex flex-col gap-2 sm:flex-row">
            <Input name="q" placeholder={t(locale, "kbPlaceholderKeyword")} className="min-w-0 flex-1" />
            <Button type="submit" variant="secondary">
              {t(locale, "knowledgeSearch")}
            </Button>
          </form>
        </Card>

        <Card id="knowledge-add-section" className="scroll-mt-24 space-y-3 p-4 lg:col-span-1">
          <CardTitle>{t(locale, "knowledgeAddNew")}</CardTitle>
          <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "kbAddNewLandingHint")}</p>
          {canCreate ? (
            <Link href="/knowledge/browse#knowledge-create">
              <Button type="button" className="w-full sm:w-auto">
                {t(locale, "knowledgeAddNew")}
              </Button>
            </Link>
          ) : (
            <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "kbNoCreatePermission")}</p>
          )}
        </Card>

        <Card className="space-y-2 p-4 lg:col-span-1">
          <CardTitle>{t(locale, "knowledgeBrowse")}</CardTitle>
          <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "kbBrowseLandingHint")}</p>
          <Link href="/knowledge/browse">
            <Button type="button" variant="secondary" className="w-full sm:w-auto">
              {t(locale, "knowledgeSeeAll")}
            </Button>
          </Link>
        </Card>
      </div>

      <div>
        <h2 className="text-sm font-semibold tracking-wide text-[hsl(var(--muted))]">{t(locale, "kbBrowseByCategoryTitle")}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ORDER.map((layer) => (
            <Link key={layer} href={`/knowledge/browse?layer=${layer}`}>
              <Card className="h-full p-4 transition hover:border-[hsl(var(--accent))]/40">
                <CardTitle className="text-base">{tKnowledgeLayer(locale, layer)}</CardTitle>
                <p className="mt-2 text-xs text-[hsl(var(--muted))]">{t(locale, "kbOpenFiltered")}</p>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <p className="text-xs text-[hsl(var(--muted))]">
        {projectCount} {t(locale, "kbProjectsUnit")} · {companyCount} {t(locale, "kbCompaniesUnit")}{" "}
        {t(locale, "kbIndexedForFilters")}
      </p>
    </div>
  );
}
