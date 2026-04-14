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
import { addExternalResourceLinkAction } from "@/app/actions/attachments";
import { requireUser } from "@/lib/auth";
import type { AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AttachmentVersionTree } from "@/components/attachment-version-tree";
import { DetailsHashOpener } from "@/components/details-hash-opener";
import { getLocale } from "@/lib/locale";
import { t, tKnowledgeLayer } from "@/lib/messages";

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
  const rawLayer = String(sp.layer ?? "ALL").trim();
  const layerFilter: KnowledgeLayer | "ALL" =
    rawLayer === "" || rawLayer === "ALL" || !ORDER.includes(rawLayer as KnowledgeLayer) ? "ALL" : (rawLayer as KnowledgeLayer);
  const isCategoryView = layerFilter !== "ALL";
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
      include: {
        author: true,
        project: { include: { company: true } },
        company: true,
        attachments: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      },
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

  const layersToShow: KnowledgeLayer[] = isCategoryView ? [layerFilter as KnowledgeLayer] : ORDER;

  return (
    <div className="space-y-6">
      <DetailsHashOpener />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-[hsl(var(--muted))]">
            <Link href="/knowledge" className="underline">
              {t(locale, "navKnowledge")}
            </Link>
            {isCategoryView ? (
              <>
                {" "}
                /{" "}
                <Link href="/knowledge/browse" className="underline">
                  {t(locale, "knowledgeSeeAll")}
                </Link>{" "}
                / {tKnowledgeLayer(locale, layerFilter as KnowledgeLayer)}
              </>
            ) : (
              <> / {t(locale, "knowledgeSeeAll")}</>
            )}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isCategoryView ? tKnowledgeLayer(locale, layerFilter as KnowledgeLayer) : t(locale, "knowledgeSeeAll")}
          </h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted))]">
            {isCategoryView ? t(locale, "kbCategoryViewCaption") : t(locale, "kbFullListCaption")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isCategoryView ? (
            <Link href="/knowledge#knowledge-add-section">
              <Button type="button" variant="secondary" className="text-xs">
                {t(locale, "kbAddFromHub")}
              </Button>
            </Link>
          ) : null}
          <Link href="/knowledge">
            <Button type="button" variant="secondary">
              {t(locale, "navKnowledge")} {t(locale, "kbHubLink")}
            </Button>
          </Link>
        </div>
      </div>

      {isCategoryView ? (
        <form
          action="/knowledge/browse"
          method="get"
          className="flex flex-wrap items-end gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs"
        >
          <input type="hidden" name="layer" value={layerFilter} />
          <div className="flex min-w-[140px] flex-1 flex-col gap-0.5">
            <label className="text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--muted))]">
              {t(locale, "commonKeyword")}
            </label>
            <Input name="q" defaultValue={q} placeholder={t(locale, "kbPlaceholderKeyword")} className="h-8 text-xs" />
          </div>
          <div className="flex min-w-[120px] flex-col gap-0.5">
            <label className="text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--muted))]">
              {t(locale, "commonCompany")}
            </label>
            <select
              name="companyId"
              defaultValue={companyFilter}
              className="h-8 rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-xs"
            >
              <option value="">{t(locale, "kbAllCompanies")}</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-[120px] flex-col gap-0.5">
            <label className="text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--muted))]">
              {t(locale, "commonProject")}
            </label>
            <select
              name="projectId"
              defaultValue={projectFilter}
              className="h-8 rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-xs"
            >
              <option value="">{t(locale, "kbAllProjects")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-[100px] flex-col gap-0.5">
            <label className="text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--muted))]">
              {t(locale, "commonAuthor")}
            </label>
            <select
              name="authorId"
              defaultValue={authorFilter}
              className="h-8 rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-xs"
            >
              <option value="">{t(locale, "kbAllAuthors")}</option>
              {authors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-[100px] flex-col gap-0.5">
            <label className="text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--muted))]">
              {t(locale, "commonTagContains")}
            </label>
            <Input name="tag" defaultValue={tagFilter} placeholder="…" className="h-8 text-xs" />
          </div>
          <Button type="submit" variant="secondary" className="h-8 text-xs">
            {t(locale, "btnApply")}
          </Button>
          <a className="inline-flex h-8 items-center text-xs underline" href={`/knowledge/browse?layer=${layerFilter}`}>
            {t(locale, "btnReset")}
          </a>
        </form>
      ) : (
        <Card className="space-y-3 p-4">
          <CardTitle>{t(locale, "knowledgeSearch")}</CardTitle>
          <form action="/knowledge/browse" method="get" className="grid gap-2 md:grid-cols-6">
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">{t(locale, "commonKeyword")}</label>
              <Input name="q" defaultValue={q} placeholder={t(locale, "kbPlaceholderKeyword")} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "commonLayer")}</label>
              <select
                name="layer"
                defaultValue={layerFilter}
                className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm"
              >
                <option value="ALL">{t(locale, "kbAllLayers")}</option>
                {ORDER.map((layer) => (
                  <option key={layer} value={layer}>
                    {tKnowledgeLayer(locale, layer)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "commonCompany")}</label>
              <select
                name="companyId"
                defaultValue={companyFilter}
                className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm"
              >
                <option value="">{t(locale, "kbAllCompanies")}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "commonProject")}</label>
              <select
                name="projectId"
                defaultValue={projectFilter}
                className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm"
              >
                <option value="">{t(locale, "kbAllProjects")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "commonAuthor")}</label>
              <select
                name="authorId"
                defaultValue={authorFilter}
                className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm"
              >
                <option value="">{t(locale, "kbAllAuthors")}</option>
                {authors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "commonTagContains")}</label>
              <Input name="tag" defaultValue={tagFilter} placeholder="legal, template..." />
            </div>
            <div className="md:col-span-6 flex gap-2">
              <Button type="submit" variant="secondary">
                {t(locale, "btnApply")}
              </Button>
              <a className="inline-flex items-center text-xs underline" href="/knowledge/browse">
                {t(locale, "btnReset")}
              </a>
            </div>
          </form>
        </Card>
      )}

      {!isCategoryView && canCreate ? (
        <Card id="knowledge-create" className="scroll-mt-24 space-y-3 p-4">
          <CardTitle>{t(locale, "knowledgeAddNew")}</CardTitle>
          <form action={createKnowledgeAssetAction} className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">{t(locale, "commonTitle")}</label>
              <Input name="title" required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "commonTitleEn")}</label>
              <Input name="titleEn" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "commonTitleZh")}</label>
              <Input name="titleZh" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "commonLayer")}</label>
              <select name="layer" className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm">
                {ORDER.map((layer) => (
                  <option key={layer} value={layer}>
                    {tKnowledgeLayer(locale, layer)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">
                {t(locale, "commonProject")} ({t(locale, "commonOptional")})
              </label>
              <select name="projectId" className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm">
                <option value="">{t(locale, "kbGeneralProject")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">
                {t(locale, "commonCompany")} ({t(locale, "commonOptional")})
              </label>
              <select name="companyId" className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm">
                <option value="">{t(locale, "kbInferCompany")}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">{t(locale, "commonSummary")}</label>
              <Input name="summary" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">{t(locale, "commonContent")}</label>
              <textarea
                name="content"
                rows={4}
                className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm"
                placeholder={t(locale, "kbContentOrUrlHint")}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "commonLabels")}</label>
              <Input name="tags" placeholder={t(locale, "kbTagsPlaceholder")} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "commonSourceUrl")}</label>
              <Input name="sourceUrl" type="url" placeholder="https://drive.google.com/..." />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" variant="secondary">
                {t(locale, "kbCreateAsset")}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {layersToShow.map((layer) => {
        const rows = assets.filter((a) => a.layer === layer);
        return (
          <Card key={layer} className={isCategoryView ? "space-y-3 border-dashed p-4" : "space-y-3 p-4"}>
            {!isCategoryView ? <CardTitle>{tKnowledgeLayer(locale, layer)}</CardTitle> : null}
            {rows.length ? (
              <ul className="space-y-2 text-sm">
                {rows.map((a) => (
                  <li key={a.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
                    <div className="font-medium">{a.title}</div>
                    <div className="text-xs text-[hsl(var(--muted))]">
                      {t(locale, "kbByAuthor")} {a.author.name} ·{" "}
                      {a.project?.name ?? a.company?.name ?? t(locale, "kbUncategorizedShort")} ·{" "}
                      {t(locale, "kbReusedTimes")} {a.reuseCount} {t(locale, "kbTimesSuffix")}
                    </div>
                    {a.summary ? <p className="mt-1 text-xs text-[hsl(var(--muted))]">{a.summary}</p> : null}
                    <p className="mt-1 text-sm">{a.content}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <form action={incrementKnowledgeReuseAction}>
                        <input type="hidden" name="id" value={a.id} />
                        <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                          {t(locale, "kbMarkReused")}
                        </Button>
                      </form>
                      {canCreate ? (
                        <form action={softDeleteKnowledgeAssetAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                            {t(locale, "btnArchive")}
                          </Button>
                        </form>
                      ) : null}
                    </div>
                    {canCreate ? (
                      <form action={updateKnowledgeAssetAction} className="mt-2 grid gap-2 rounded-md border border-[hsl(var(--border))] p-2 md:grid-cols-2">
                        <input type="hidden" name="id" value={a.id} />
                        <div className="space-y-1 md:col-span-2">
                          <label className="text-xs font-medium">{t(locale, "kbEditTitle")}</label>
                          <Input name="title" defaultValue={a.title} required />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">{t(locale, "commonTitleEn")}</label>
                          <Input name="titleEn" defaultValue={a.titleEn ?? ""} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">{t(locale, "commonTitleZh")}</label>
                          <Input name="titleZh" defaultValue={a.titleZh ?? ""} />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <label className="text-xs font-medium">{t(locale, "kbEditSummary")}</label>
                          <Input name="summary" defaultValue={a.summary ?? ""} />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <label className="text-xs font-medium">{t(locale, "kbEditContent")}</label>
                          <textarea
                            name="content"
                            defaultValue={a.content}
                            rows={3}
                            className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">{t(locale, "kbTagsField")}</label>
                          <Input name="tags" defaultValue={a.tags ?? ""} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">{t(locale, "commonSourceUrl")}</label>
                          <Input name="sourceUrl" defaultValue={a.sourceUrl ?? ""} />
                        </div>
                        <div className="md:col-span-2">
                          <Button type="submit" variant="secondary" className="h-8 text-xs">
                            {t(locale, "kbSaveEdits")}
                          </Button>
                        </div>
                      </form>
                    ) : null}
                    {canCreate && (user.id === a.authorId || user.isSuperAdmin) ? (
                      <div className="mt-2 space-y-2 rounded-md border border-dashed border-[hsl(var(--border))] p-2">
                        <p className="text-xs font-medium">{t(locale, "kbAttachments")}</p>
                        <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "kbAttachHelp")}</p>
                        {a.attachments.length ? (
                          <AttachmentVersionTree
                            attachments={a.attachments.map((f) => ({
                              id: f.id,
                              previousVersionId: f.previousVersionId,
                              fileName: f.fileName,
                              createdAt: f.createdAt,
                              resourceKind: f.resourceKind,
                              externalUrl: f.externalUrl,
                              description:
                                [
                                  f.titleEn || f.titleZh
                                    ? `(${[f.titleEn, f.titleZh].filter(Boolean).join(" / ")})`
                                    : null,
                                  f.description,
                                ]
                                  .filter(Boolean)
                                  .join(" ") || null,
                            }))}
                            locale={locale}
                            showTrash={canCreate && (user.id === a.authorId || user.isSuperAdmin)}
                          />
                        ) : (
                          <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "wfNoFiles")}</p>
                        )}
                        <form
                          action={addExternalResourceLinkAction}
                          className="grid gap-2 border-t border-[hsl(var(--border))] pt-2 md:grid-cols-2"
                        >
                          <input type="hidden" name="knowledgeAssetId" value={a.id} />
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-xs font-medium">{t(locale, "resExternalUrl")}</label>
                            <Input name="externalUrl" type="url" required placeholder="https://drive.google.com/..." className="text-xs" />
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
                              {a.attachments.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.fileName} ({f.createdAt.toISOString().slice(0, 10)})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="md:col-span-2">
                            <Button type="submit" variant="secondary" className="h-8 text-xs">
                              {t(locale, "resAddLink")}
                            </Button>
                          </div>
                        </form>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "kbNoAssetsInLayer")}</p>
            )}
          </Card>
        );
      })}

      {canCreate ? (
        <Card className="space-y-3 p-4">
          <CardTitle>{t(locale, "kbArchivedTitle")}</CardTitle>
          {deletedAssets.length ? (
            <ul className="space-y-2 text-sm">
              {deletedAssets.map((a) => (
                <li key={a.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
                  <div className="font-medium">{a.title}</div>
                  <div className="text-xs text-[hsl(var(--muted))]">
                    {t(locale, "kbByAuthor")} {a.author.name} · {a.project?.name ?? t(locale, "kbUncategorizedShort")}
                  </div>
                  <form action={restoreKnowledgeAssetAction} className="mt-2">
                    <input type="hidden" name="id" value={a.id} />
                    <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                      {t(locale, "btnRestore")}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "kbNoArchived")}</p>
          )}
        </Card>
      ) : null}
    </div>
  );
}
