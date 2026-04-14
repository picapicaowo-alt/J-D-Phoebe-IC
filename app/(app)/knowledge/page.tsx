import Link from "next/link";
import { redirect } from "next/navigation";
import { KnowledgeLayer } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import type { AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";

const LAYER_LABEL: Record<KnowledgeLayer, string> = {
  TEMPLATE_PLAYBOOK: "Templates / Playbooks",
  REFERENCE_RESOURCE: "References / Resources",
  INTERNAL_INSIGHT: "Internal Insights / Notes",
  REUSABLE_OUTPUT: "Reusable Outputs",
};

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

  const [recent, reused, mine, projects, companies] = await Promise.all([
    prisma.knowledgeAsset.findMany({
      where: { deletedAt: null },
      include: { author: true, project: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.knowledgeAsset.findMany({
      where: { deletedAt: null },
      include: { author: true, project: true },
      orderBy: { reuseCount: "desc" },
      take: 6,
    }),
    prisma.knowledgeAsset.findMany({
      where: { deletedAt: null, authorId: user.id },
      include: { author: true, project: true },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    prisma.project.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, take: 60 }),
    prisma.company.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, take: 40 }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t(locale, "knowledgeHubTitle")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-[hsl(var(--muted))]">{t(locale, "knowledgeHubSubtitle")}</p>
      </div>

      <Card className="space-y-3 p-4">
        <CardTitle>{t(locale, "knowledgeSearch")}</CardTitle>
        <form action="/knowledge/browse" method="get" className="flex flex-wrap gap-2">
          <Input name="q" placeholder="Keyword, title, content…" className="max-w-md flex-1" />
          <Button type="submit" variant="secondary">{t(locale, "knowledgeSearch")}</Button>
          <Link href="/knowledge/browse">
            <Button type="button" variant="secondary">{t(locale, "knowledgeSeeAll")}</Button>
          </Link>
        </form>
      </Card>

      <div>
        <h2 className="text-sm font-semibold tracking-wide text-[hsl(var(--muted))]">{t(locale, "knowledgeBrowse")}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ORDER.map((layer) => (
            <Link key={layer} href={`/knowledge/browse?layer=${layer}`}>
              <Card className="h-full p-4 transition hover:border-[hsl(var(--accent))]/40">
                <CardTitle className="text-base">{LAYER_LABEL[layer]}</CardTitle>
                <p className="mt-2 text-xs text-[hsl(var(--muted))]">Open filtered list</p>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-[hsl(var(--muted))]">{t(locale, "knowledgeAddNew")}</h2>
        <Link href="/knowledge/browse">
          <Button type="button" variant="secondary">{t(locale, "knowledgeAddNew")} (form)</Button>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-2 p-4">
          <CardTitle className="text-base">{t(locale, "knowledgeRecent")}</CardTitle>
          <ul className="space-y-2 text-sm">
            {recent.map((a) => (
              <li key={a.id} className="rounded-md border border-[hsl(var(--border))] px-2 py-1">
                <Link className="font-medium hover:underline" href={`/knowledge/browse?q=${encodeURIComponent(a.title)}`}>
                  {a.title}
                </Link>
                <div className="text-xs text-[hsl(var(--muted))]">{a.author.name}</div>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="space-y-2 p-4">
          <CardTitle className="text-base">{t(locale, "knowledgeReused")}</CardTitle>
          <ul className="space-y-2 text-sm">
            {reused.map((a) => (
              <li key={a.id} className="rounded-md border border-[hsl(var(--border))] px-2 py-1">
                <span className="font-medium">{a.title}</span>
                <div className="text-xs text-[hsl(var(--muted))]">Reused {a.reuseCount}×</div>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="space-y-2 p-4">
          <CardTitle className="text-base">{t(locale, "knowledgeMine")}</CardTitle>
          <ul className="space-y-2 text-sm">
            {mine.length ? (
              mine.map((a) => (
                <li key={a.id} className="rounded-md border border-[hsl(var(--border))] px-2 py-1">
                  <span className="font-medium">{a.title}</span>
                  <div className="text-xs text-[hsl(var(--muted))]">{LAYER_LABEL[a.layer]}</div>
                </li>
              ))
            ) : (
              <li className="text-xs text-[hsl(var(--muted))]">No contributions yet.</li>
            )}
          </ul>
        </Card>
      </div>

      <p className="text-xs text-[hsl(var(--muted))]">
        {projects.length} projects · {companies.length} companies indexed for filters on the browse view.
      </p>
    </div>
  );
}
