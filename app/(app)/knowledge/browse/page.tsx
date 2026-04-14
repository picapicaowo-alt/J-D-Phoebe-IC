import { KnowledgeLayer } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createKnowledgeAssetAction,
  incrementKnowledgeReuseAction,
  restoreKnowledgeAssetAction,
  softDeleteKnowledgeAssetAction,
  updateKnowledgeAssetAction,
} from "@/app/actions/knowledge";
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

export default async function KnowledgeBrowsePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    layer?: KnowledgeLayer | "ALL";
    projectId?: string;
    companyId?: string;
    authorId?: string;
    tag?: string;
  }>;
}) {
  const user = (await requireUser()) as AccessUser;
  if (!(await userHasPermission(user, "knowledge.read"))) redirect("/home");
  const locale = await getLocale();
  const canCreate = await userHasPermission(user, "knowledge.create");
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim();
  const layerFilter = (String(sp.layer ?? "ALL").trim() || "ALL") as KnowledgeLayer | "ALL";
  const projectFilter = String(sp.projectId ?? "").trim();
  const companyFilter = String(sp.companyId ?? "").trim();
  const authorFilter = String(sp.authorId ?? "").trim();
  const tagFilter = String(sp.tag ?? "").trim();

  const where = {
    deletedAt: null,
    ...(layerFilter !== "ALL" ? { layer: layerFilter } : {}),
    ...(projectFilter ? { projectId: projectFilter } : {}),
    ...(companyFilter ? { companyId: companyFilter } : {}),
    ...(authorFilter ? { authorId: authorFilter } : {}),
    ...(tagFilter ? { tags: { contains: tagFilter, mode: "insensitive" as const } } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { titleEn: { contains: q, mode: "insensitive" as const } },
            { titleZh: { contains: q, mode: "insensitive" as const } },
            { summary: { contains: q, mode: "insensitive" as const } },
            { content: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [assets, deletedAssets, projects, authors, companies] = await Promise.all([
    prisma.knowledgeAsset.findMany({
      where,
      include: { author: true, project: { include: { company: true } }, company: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.knowledgeAsset.findMany({
      where: { deletedAt: { not: null } },
      include: { author: true, project: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    prisma.project.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, take: 100 }),
    prisma.user.findMany({ where: { deletedAt: null, active: true }, orderBy: { name: "asc" }, take: 200 }),
    prisma.company.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, take: 80 }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-[hsl(var(--muted))]">
            <Link href="/knowledge" className="underline">{t(locale, "navKnowledge")}</Link> / {t(locale, "knowledgeSeeAll")}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{t(locale, "knowledgeSeeAll")}</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted))]">Full list, filters, and edits.</p>
        </div>
        <Link href="/knowledge">
          <Button type="button" variant="secondary">{t(locale, "navKnowledge")} hub</Button>
        </Link>
      </div>

      <Card className="space-y-3 p-4">
        <CardTitle>{t(locale, "knowledgeSearch")}</CardTitle>
        <form action="/knowledge/browse" method="get" className="grid gap-2 md:grid-cols-6">
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-medium">Keyword</label>
            <Input name="q" defaultValue={q} placeholder="title, summary, content..." />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Layer</label>
            <select
              name="layer"
              defaultValue={layerFilter}
              className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm"
            >
              <option value="ALL">All layers</option>
              {ORDER.map((layer) => (
                <option key={layer} value={layer}>
                  {LAYER_LABEL[layer]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Company</label>
            <select
              name="companyId"
              defaultValue={companyFilter}
              className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm"
            >
              <option value="">All companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Project</label>
            <select
              name="projectId"
              defaultValue={projectFilter}
              className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Author</label>
            <select
              name="authorId"
              defaultValue={authorFilter}
              className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm"
            >
              <option value="">All authors</option>
              {authors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Tag contains</label>
            <Input name="tag" defaultValue={tagFilter} placeholder="legal, template..." />
          </div>
          <div className="md:col-span-6 flex gap-2">
            <Button type="submit" variant="secondary">
              Apply
            </Button>
            <a className="inline-flex items-center text-xs underline" href="/knowledge/browse">
              Reset
            </a>
          </div>
        </form>
      </Card>

      {canCreate ? (
        <Card className="space-y-3 p-4">
          <CardTitle>{t(locale, "knowledgeAddNew")}</CardTitle>
          <form action={createKnowledgeAssetAction} className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">Title</label>
              <Input name="title" required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Title (EN)</label>
              <Input name="titleEn" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Title (ZH)</label>
              <Input name="titleZh" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Layer</label>
              <select name="layer" className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm">
                {ORDER.map((layer) => (
                  <option key={layer} value={layer}>{LAYER_LABEL[layer]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Project (optional)</label>
              <select name="projectId" className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm">
                <option value="">General / cross-project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">Company (optional)</label>
              <select name="companyId" className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm">
                <option value="">Infer from project / none</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">Summary</label>
              <Input name="summary" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">Content</label>
              <textarea name="content" required rows={4} className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Tags</label>
              <Input name="tags" placeholder="comma,separated,tags" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Source URL</label>
              <Input name="sourceUrl" type="url" />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" variant="secondary">Create asset</Button>
            </div>
          </form>
        </Card>
      ) : null}

      {ORDER.map((layer) => {
        const rows = assets.filter((a) => a.layer === layer);
        return (
          <Card key={layer} className="space-y-3 p-4">
            <CardTitle>{LAYER_LABEL[layer]}</CardTitle>
            {rows.length ? (
              <ul className="space-y-2 text-sm">
                {rows.map((a) => (
                  <li key={a.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
                    <div className="font-medium">{a.title}</div>
                    <div className="text-xs text-[hsl(var(--muted))]">
                      by {a.author.name} · {a.project?.name ?? a.company?.name ?? "General"} · reused {a.reuseCount} times
                    </div>
                    {a.summary ? <p className="mt-1 text-xs text-[hsl(var(--muted))]">{a.summary}</p> : null}
                    <p className="mt-1 text-sm">{a.content}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <form action={incrementKnowledgeReuseAction}>
                        <input type="hidden" name="id" value={a.id} />
                        <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                          Mark as reused +1
                        </Button>
                      </form>
                      {canCreate ? (
                        <form action={softDeleteKnowledgeAssetAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                            Archive
                          </Button>
                        </form>
                      ) : null}
                    </div>
                    {canCreate ? (
                      <form action={updateKnowledgeAssetAction} className="mt-2 grid gap-2 rounded-md border border-[hsl(var(--border))] p-2 md:grid-cols-2">
                        <input type="hidden" name="id" value={a.id} />
                        <div className="space-y-1 md:col-span-2">
                          <label className="text-xs font-medium">Edit title</label>
                          <Input name="title" defaultValue={a.title} required />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Title EN</label>
                          <Input name="titleEn" defaultValue={a.titleEn ?? ""} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Title ZH</label>
                          <Input name="titleZh" defaultValue={a.titleZh ?? ""} />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <label className="text-xs font-medium">Edit summary</label>
                          <Input name="summary" defaultValue={a.summary ?? ""} />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <label className="text-xs font-medium">Edit content</label>
                          <textarea
                            name="content"
                            defaultValue={a.content}
                            rows={3}
                            className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Tags</label>
                          <Input name="tags" defaultValue={a.tags ?? ""} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Source URL</label>
                          <Input name="sourceUrl" defaultValue={a.sourceUrl ?? ""} />
                        </div>
                        <div className="md:col-span-2">
                          <Button type="submit" variant="secondary" className="h-8 text-xs">
                            Save edits
                          </Button>
                        </div>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[hsl(var(--muted))]">No assets in this layer yet.</p>
            )}
          </Card>
        );
      })}

      {canCreate ? (
        <Card className="space-y-3 p-4">
          <CardTitle>Archived knowledge assets</CardTitle>
          {deletedAssets.length ? (
            <ul className="space-y-2 text-sm">
              {deletedAssets.map((a) => (
                <li key={a.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
                  <div className="font-medium">{a.title}</div>
                  <div className="text-xs text-[hsl(var(--muted))]">
                    by {a.author.name} · {a.project?.name ?? "General"}
                  </div>
                  <form action={restoreKnowledgeAssetAction} className="mt-2">
                    <input type="hidden" name="id" value={a.id} />
                    <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                      Restore
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[hsl(var(--muted))]">No archived knowledge assets.</p>
          )}
        </Card>
      ) : null}
    </div>
  );
}
