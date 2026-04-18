import { KnowledgeLayer } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createKnowledgeAssetAction,
  deleteKnowledgeAssetAction,
  incrementKnowledgeReuseAction,
  restoreKnowledgeAssetAction,
  softDeleteKnowledgeAssetAction,
  updateKnowledgeAssetAction,
} from "@/app/actions/knowledge";
import { addExternalResourceLinkAction, uploadKnowledgeAttachmentAction } from "@/app/actions/attachments";
import { requireUser } from "@/lib/auth";
import { canManageKnowledgeAsset, type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Input } from "@/components/ui/input";
import { AttachmentVersionTree } from "@/components/attachment-version-tree";
import { DetailsHashOpener } from "@/components/details-hash-opener";
import { CloseDialogButton, OpenDialogButton } from "@/components/dialog-launcher";
import { getLocale, type Locale } from "@/lib/locale";
import { t, tKnowledgeLayer } from "@/lib/messages";

const ORDER: KnowledgeLayer[] = [
  "TEMPLATE_PLAYBOOK",
  "REFERENCE_RESOURCE",
  "INTERNAL_INSIGHT",
  "REUSABLE_OUTPUT",
];

function sourceTypeLabel(locale: Locale, url: string | null | undefined): string {
  const u = (url ?? "").trim();
  if (!u) return t(locale, "kbSourceNone");
  const low = u.toLowerCase();
  if (low.includes("drive.google.com") || low.includes("docs.google.com")) return t(locale, "kbSourceGoogleDrive");
  return t(locale, "kbSourceExternalLink");
}

export async function KnowledgeBrowseBody({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    error?: string;
    layer?: KnowledgeLayer | "ALL";
    projectId?: string;
    companyId?: string;
    authorId?: string;
    tag?: string;
    create?: string;
  }>;
}) {
  const user = (await requireUser()) as AccessUser;
  if (!(await userHasPermission(user, "knowledge.read"))) redirect("/home");
  const locale = await getLocale();
  const canCreate = await userHasPermission(user, "knowledge.create");
  const sp = await searchParams;
  const createError = String(sp.error ?? "").trim();
  const showCreateError = createError === "missing_content_or_url";
  const isCreateMode = String(sp.create ?? "").trim() === "1";

  if (isCreateMode) {
    if (!canCreate) redirect("/knowledge");
    const [projects, companies] = await Promise.all([
      prisma.project.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, take: 100 }),
      prisma.company.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, take: 80 }),
    ]);
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/knowledge"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t(locale, "navKnowledge")}
          </Link>
        </div>
        <Card id="knowledge-create" className="scroll-mt-24 space-y-3 p-4">
          <CardTitle>{t(locale, "knowledgeAddNew")}</CardTitle>
          {showCreateError ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {t(locale, "kbCreateNeedsContentOrUrl")}
            </p>
          ) : null}
          <form action={createKnowledgeAssetAction} encType="multipart/form-data" className="grid gap-2 md:grid-cols-2">
            <input type="hidden" name="returnTo" value="/knowledge/browse?create=1#knowledge-create" />
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium">{t(locale, "commonTitle")}</label>
              <Input name="title" required />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t(locale, "commonTitleEn")}</label>
              <Input name="titleEn" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t(locale, "commonTitleZh")}</label>
              <Input name="titleZh" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t(locale, "commonLayer")}</label>
              <select name="layer" className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm">
                {ORDER.map((layer) => (
                  <option key={layer} value={layer}>
                    {tKnowledgeLayer(locale, layer)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">
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
              <label className="text-sm font-medium">
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
              <label className="text-sm font-medium">{t(locale, "commonSummary")}</label>
              <Input name="summary" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium">{t(locale, "commonContent")}</label>
              <textarea
                name="content"
                rows={4}
                className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm"
                placeholder={t(locale, "kbContentOrUrlHint")}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t(locale, "commonLabels")}</label>
              <Input name="tags" placeholder={t(locale, "kbTagsPlaceholder")} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t(locale, "commonSourceUrl")}</label>
              <Input name="sourceUrl" type="url" placeholder="https://drive.google.com/..." />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t(locale, "kbUploadFile")}</label>
              <input type="file" name="file" className="block h-10 w-full text-sm" />
            </div>
            <div className="md:col-span-2">
              <FormSubmitButton type="submit" variant="secondary">
                {t(locale, "kbCreateAsset")}
              </FormSubmitButton>
            </div>
          </form>
        </Card>
      </div>
    );
  }

  const q = String(sp.q ?? "").trim();
  const rawLayer = String(sp.layer ?? "ALL").trim();
  const layerFilter: KnowledgeLayer | "ALL" =
    rawLayer === "" || rawLayer === "ALL" || !ORDER.includes(rawLayer as KnowledgeLayer) ? "ALL" : (rawLayer as KnowledgeLayer);
  const isCategoryView = layerFilter !== "ALL";
  const projectFilter = String(sp.projectId ?? "").trim();
  const projectScope = Boolean(projectFilter);
  const hubEntryLayout = isCategoryView || projectScope;
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

  const scopedProjectPromise = projectFilter
    ? prisma.project.findFirst({ where: { id: projectFilter, deletedAt: null }, include: { company: true } })
    : Promise.resolve(null);

  const [assets, deletedAssets, projects, authors, companies, categoryTotal, scopedProject] = await Promise.all([
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
    isCategoryView ? prisma.knowledgeAsset.count({ where }) : Promise.resolve(0),
    scopedProjectPromise,
  ]);

  if (projectFilter && !scopedProject) redirect("/knowledge/browse");

  const layersToShow: KnowledgeLayer[] = isCategoryView ? [layerFilter as KnowledgeLayer] : ORDER;

  return (
    <div className="space-y-6">
      <DetailsHashOpener />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          {isCategoryView ? (
            <Link
              href="/knowledge"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t(locale, "navKnowledge")}
            </Link>
          ) : (
            <p className="text-sm text-[hsl(var(--muted))]">
              <Link href="/knowledge" className="underline">
                {t(locale, "navKnowledge")}
              </Link>
              {" / "}
              {scopedProject ? (
                <Link href={`/projects/${scopedProject.id}`} className="underline">
                  {scopedProject.company.name} · {scopedProject.name}
                </Link>
              ) : (
                t(locale, "knowledgeSeeAll")
              )}
            </p>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
            {scopedProject
              ? `${scopedProject.company.name} · ${scopedProject.name}`
              : isCategoryView
                ? tKnowledgeLayer(locale, layerFilter as KnowledgeLayer)
                : t(locale, "knowledgeSeeAll")}
          </h1>
          <p className="text-sm text-[hsl(var(--muted))]">
            {scopedProject
              ? t(locale, "kbProjectScopedLead")
              : isCategoryView
                ? t(locale, "kbCategoryItemCount").replace("{n}", String(categoryTotal))
                : t(locale, "kbFullListCaption")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isCategoryView && canCreate ? (
            <Link href="/knowledge/browse?create=1">
              <Button type="button" className="rounded-[10px] px-4">
                + {t(locale, "knowledgeAddNew")}
              </Button>
            </Link>
          ) : null}
          {!isCategoryView ? (
            <Link href="/knowledge">
              <Button type="button" variant="secondary">
                {t(locale, "navKnowledge")} {t(locale, "kbHubLink")}
              </Button>
            </Link>
          ) : (
            <Link href="/knowledge/browse">
              <Button type="button" variant="secondary" className="text-sm">
                {t(locale, "knowledgeSeeAll")}
              </Button>
            </Link>
          )}
        </div>
      </div>

      {isCategoryView ? (
        <form action="/knowledge/browse" method="get" className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10 p-3">
          <input type="hidden" name="layer" value={layerFilter} />
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted))]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
                <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
            <Input
              name="q"
              defaultValue={q}
              placeholder={t(locale, "kbSearchInCategoryPh")}
              className="h-11 rounded-[10px] border-[hsl(var(--border))] bg-[hsl(var(--card))] pl-10 pr-3 text-sm shadow-sm"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <FormSubmitButton type="submit" variant="secondary" className="h-9 rounded-[10px] text-sm">
              {t(locale, "knowledgeSearch")}
            </FormSubmitButton>
            <a className="inline-flex h-9 items-center text-sm text-[hsl(var(--muted))] underline" href={`/knowledge/browse?layer=${layerFilter}`}>
              {t(locale, "btnReset")}
            </a>
          </div>
        </form>
      ) : null}

      {isCategoryView ? (
        <form
          action="/knowledge/browse"
          method="get"
          className="flex flex-wrap items-end gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm"
        >
          <input type="hidden" name="layer" value={layerFilter} />
          <input type="hidden" name="q" value={q} />
          <div className="flex min-w-[120px] flex-col gap-0.5">
            <label className="text-sm font-medium uppercase tracking-wide text-[hsl(var(--muted))]">
              {t(locale, "commonCompany")}
            </label>
            <select
              name="companyId"
              defaultValue={companyFilter}
              className="h-8 rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-sm"
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
            <label className="text-sm font-medium uppercase tracking-wide text-[hsl(var(--muted))]">
              {t(locale, "commonProject")}
            </label>
            <select
              name="projectId"
              defaultValue={projectFilter}
              className="h-8 rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-sm"
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
            <label className="text-sm font-medium uppercase tracking-wide text-[hsl(var(--muted))]">
              {t(locale, "commonAuthor")}
            </label>
            <select
              name="authorId"
              defaultValue={authorFilter}
              className="h-8 rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-sm"
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
            <label className="text-sm font-medium uppercase tracking-wide text-[hsl(var(--muted))]">
              {t(locale, "commonTagContains")}
            </label>
            <Input name="tag" defaultValue={tagFilter} placeholder="…" className="h-8 text-sm" />
          </div>
          <FormSubmitButton type="submit" variant="secondary" className="h-8 text-sm">
            {t(locale, "btnApply")}
          </FormSubmitButton>
          <a className="inline-flex h-8 items-center text-sm underline" href={`/knowledge/browse?layer=${layerFilter}`}>
            {t(locale, "btnReset")}
          </a>
        </form>
      ) : (
        <Card className="space-y-3 p-4">
          <CardTitle>{t(locale, "knowledgeSearch")}</CardTitle>
          <form action="/knowledge/browse" method="get" className="grid gap-2 md:grid-cols-6">
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium">{t(locale, "commonKeyword")}</label>
              <Input name="q" defaultValue={q} placeholder={t(locale, "kbPlaceholderKeyword")} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t(locale, "commonLayer")}</label>
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
              <label className="text-sm font-medium">{t(locale, "commonCompany")}</label>
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
              <label className="text-sm font-medium">{t(locale, "commonProject")}</label>
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
              <label className="text-sm font-medium">{t(locale, "commonAuthor")}</label>
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
              <label className="text-sm font-medium">{t(locale, "commonTagContains")}</label>
              <Input name="tag" defaultValue={tagFilter} placeholder="legal, template..." />
            </div>
            <div className="md:col-span-6 flex gap-2">
              <FormSubmitButton type="submit" variant="secondary">
                {t(locale, "btnApply")}
              </FormSubmitButton>
              <a
                className="inline-flex items-center text-sm underline"
                href={scopedProject ? `/knowledge/browse?projectId=${scopedProject.id}` : "/knowledge/browse"}
              >
                {t(locale, "btnReset")}
              </a>
            </div>
          </form>
        </Card>
      )}

      {!isCategoryView && canCreate ? (
        projectScope ? (
          <details className="scroll-mt-24 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-[hsl(var(--foreground))]">
              {t(locale, "knowledgeAddNew")}
            </summary>
            <div className="border-t border-[hsl(var(--border))] p-4">
              {showCreateError ? (
                <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                  {t(locale, "kbCreateNeedsContentOrUrl")}
                </p>
              ) : null}
              <form action={createKnowledgeAssetAction} encType="multipart/form-data" className="grid gap-2 md:grid-cols-2">
                <input type="hidden" name="returnTo" value={`/knowledge/browse?projectId=${scopedProject?.id ?? ""}#knowledge-create`} />
                {scopedProject ? (
                  <>
                    <input type="hidden" name="projectId" value={scopedProject.id} />
                    <input type="hidden" name="companyId" value={scopedProject.companyId} />
                  </>
                ) : null}
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium">{t(locale, "commonTitle")}</label>
                  <Input name="title" required />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">{t(locale, "commonTitleEn")}</label>
                  <Input name="titleEn" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">{t(locale, "commonTitleZh")}</label>
                  <Input name="titleZh" />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium">{t(locale, "commonLayer")}</label>
                  <select name="layer" className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm">
                    {ORDER.map((layer) => (
                      <option key={layer} value={layer}>
                        {tKnowledgeLayer(locale, layer)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium">{t(locale, "commonSummary")}</label>
                  <Input name="summary" />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium">{t(locale, "commonContent")}</label>
                  <textarea
                    name="content"
                    rows={4}
                    className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm"
                    placeholder={t(locale, "kbContentOrUrlHint")}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">{t(locale, "commonLabels")}</label>
                  <Input name="tags" placeholder={t(locale, "kbTagsPlaceholder")} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">{t(locale, "commonSourceUrl")}</label>
                  <Input name="sourceUrl" type="url" placeholder="https://drive.google.com/..." />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium">{t(locale, "kbUploadFile")}</label>
                  <input type="file" name="file" className="block h-10 w-full text-sm" />
                </div>
                <div className="md:col-span-2">
                  <FormSubmitButton type="submit" variant="secondary">
                    {t(locale, "kbCreateAsset")}
                  </FormSubmitButton>
                </div>
              </form>
            </div>
          </details>
        ) : (
        <Card id="knowledge-create" className="scroll-mt-24 space-y-3 p-4">
          <CardTitle>{t(locale, "knowledgeAddNew")}</CardTitle>
          {showCreateError ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {t(locale, "kbCreateNeedsContentOrUrl")}
            </p>
          ) : null}
          <form action={createKnowledgeAssetAction} encType="multipart/form-data" className="grid gap-2 md:grid-cols-2">
            <input type="hidden" name="returnTo" value="/knowledge/browse#knowledge-create" />
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium">{t(locale, "commonTitle")}</label>
              <Input name="title" required />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t(locale, "commonTitleEn")}</label>
              <Input name="titleEn" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t(locale, "commonTitleZh")}</label>
              <Input name="titleZh" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t(locale, "commonLayer")}</label>
              <select name="layer" className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm">
                {ORDER.map((layer) => (
                  <option key={layer} value={layer}>
                    {tKnowledgeLayer(locale, layer)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">
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
              <label className="text-sm font-medium">
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
              <label className="text-sm font-medium">{t(locale, "commonSummary")}</label>
              <Input name="summary" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium">{t(locale, "commonContent")}</label>
              <textarea
                name="content"
                rows={4}
                className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm"
                placeholder={t(locale, "kbContentOrUrlHint")}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t(locale, "commonLabels")}</label>
              <Input name="tags" placeholder={t(locale, "kbTagsPlaceholder")} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t(locale, "commonSourceUrl")}</label>
              <Input name="sourceUrl" type="url" placeholder="https://drive.google.com/..." />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium">{t(locale, "kbUploadFile")}</label>
              <input type="file" name="file" className="block h-10 w-full text-sm" />
            </div>
            <div className="md:col-span-2">
              <FormSubmitButton type="submit" variant="secondary">
                {t(locale, "kbCreateAsset")}
              </FormSubmitButton>
            </div>
          </form>
        </Card>
        )
      ) : null}

      {layersToShow.map((layer) => {
        const rows = assets.filter((a) => a.layer === layer);
        return (
          <Card key={layer} className={hubEntryLayout ? "space-y-4 border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm" : "space-y-3 p-4"}>
            {!isCategoryView ? <CardTitle>{tKnowledgeLayer(locale, layer)}</CardTitle> : null}
            {rows.length ? (
              <ul className={hubEntryLayout ? "space-y-4 text-sm" : "space-y-2 text-sm"}>
                {rows.map((a) => {
                  const canMutateKb = canCreate && canManageKnowledgeAsset(user, a);
                  const canDeleteKb = user.isSuperAdmin;
                  const summaryRaw = (a.summary ?? "").trim();
                  const contentRaw = (a.content ?? "").trim();
                  const descRaw = (summaryRaw || contentRaw).replace(/\s+/g, " ").trim();
                  const descShort = descRaw.slice(0, 180);
                  const attachUrl = a.attachments.map((x) => x.externalUrl).find((u) => u && String(u).trim());
                  const openHref = ((a.sourceUrl ?? "").trim() || (attachUrl ?? "").trim()) || null;
                  return (
                  <li
                    key={a.id}
                    className={
                      hubEntryLayout
                        ? "rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm"
                        : "rounded-md border border-[hsl(var(--border))] px-3 py-2"
                    }
                  >
                    {hubEntryLayout ? (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <h3 className="min-w-0 flex-1 text-lg font-semibold leading-snug text-[hsl(var(--foreground))]">{a.title}</h3>
                          <span className="shrink-0 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10 px-2.5 py-0.5 text-sm text-[hsl(var(--muted))]">
                            {sourceTypeLabel(locale, openHref)}
                          </span>
                        </div>
                        {descRaw ? (
                          <p className="mt-2 text-sm text-[hsl(var(--foreground))]/90">
                            {descShort}
                            {descRaw.length > 180 ? "…" : ""}
                          </p>
                        ) : null}
                        {summaryRaw || contentRaw ? (
                          <details className="mt-2 rounded-md border border-dashed border-[hsl(var(--border))] text-sm">
                            <summary className="cursor-pointer select-none px-3 py-2 font-medium text-[hsl(var(--foreground))]">
                              {t(locale, "kbViewFullDetails")}
                            </summary>
                            <div className="space-y-2 border-t border-[hsl(var(--border))] px-3 py-2">
                              {summaryRaw ? (
                                <div className="space-y-1">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">{t(locale, "commonSummary")}</p>
                                  <p className="whitespace-pre-wrap text-sm text-[hsl(var(--foreground))]/90">{summaryRaw}</p>
                                </div>
                              ) : null}
                              {contentRaw && contentRaw !== summaryRaw ? (
                                <div className="space-y-1">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">{t(locale, "commonContent")}</p>
                                  <p className="whitespace-pre-wrap text-sm text-[hsl(var(--foreground))]/90">{contentRaw}</p>
                                </div>
                              ) : null}
                            </div>
                          </details>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[hsl(var(--muted))]">
                          <span>
                            {t(locale, "kbMetaContributor")}: {a.author.name}
                          </span>
                          <span>
                            {t(locale, "kbMetaCompany")}: {a.company?.name ?? "—"}
                          </span>
                          {a.project ? (
                            <span>
                              {t(locale, "kbMetaProject")}: {a.project.name}
                            </span>
                          ) : null}
                          <span>
                            {t(locale, "kbMetaAdded")}: {a.createdAt.toISOString().slice(0, 10)}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-medium">{a.title}</div>
                        <div className="text-sm text-[hsl(var(--muted))]">
                          {t(locale, "kbByAuthor")} {a.author.name} ·{" "}
                          {a.project?.name ?? a.company?.name ?? t(locale, "kbUncategorizedShort")} ·{" "}
                          {t(locale, "kbReusedTimes")} {a.reuseCount} {t(locale, "kbTimesSuffix")}
                        </div>
                        {a.summary ? <p className="mt-1 text-sm text-[hsl(var(--muted))]">{a.summary}</p> : null}
                        <p className="mt-1 text-sm">{a.content}</p>
                      </>
                    )}
                    <div
                      className={`flex flex-wrap gap-2 ${hubEntryLayout ? "mt-4 items-center justify-between gap-y-3" : "mt-2"}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {hubEntryLayout && openHref ? (
                          <a
                            href={openHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] bg-transparent px-3 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-black/5 dark:hover:bg-white/10"
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                              <path
                                d="M6 3H3v10h10v-3M13 3L8 8M9 3h4v4"
                                stroke="currentColor"
                                strokeWidth="1.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            {t(locale, "kbOpenResource")}
                          </a>
                        ) : null}
                      <form action={incrementKnowledgeReuseAction}>
                        <input type="hidden" name="id" value={a.id} />
                        <FormSubmitButton type="submit" variant="secondary" className="h-8 px-2 text-sm">
                          {t(locale, "kbMarkReused")}
                        </FormSubmitButton>
                      </form>
                      {canMutateKb ? (
                        <form action={softDeleteKnowledgeAssetAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <FormSubmitButton type="submit" variant="secondary" className="h-8 px-2 text-sm">
                            {t(locale, "btnArchive")}
                          </FormSubmitButton>
                        </form>
                      ) : null}
                      {canDeleteKb ? (
                        <form action={deleteKnowledgeAssetAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <FormSubmitButton
                            type="submit"
                            variant="secondary"
                            className="h-8 border-red-200 px-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30"
                          >
                            {t(locale, "btnDelete")}
                          </FormSubmitButton>
                        </form>
                      ) : null}
                      {hubEntryLayout && canMutateKb ? (
                        <OpenDialogButton
                          dialogId={`kb-edit-${a.id}`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] bg-transparent px-3 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                            <path
                              d="M11.3 2.3l2.4 2.4M10 3.6L3 10.6v2.8h2.8l7-7 1.4-1.4-2.8-2.8z"
                              stroke="currentColor"
                              strokeWidth="1.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          {t(locale, "kbEditKnowledge")}
                        </OpenDialogButton>
                      ) : null}
                      </div>
                      {hubEntryLayout ? (
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                          {t(locale, "kbReusedNTimes").replace("{n}", String(a.reuseCount))}
                        </span>
                      ) : null}
                    </div>
                    {canMutateKb && hubEntryLayout ? (
                      <dialog
                        id={`kb-edit-${a.id}`}
                        className="app-modal-dialog z-50 max-h-[min(90vh,640px)] w-[min(100vw-2rem,480px)] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0 shadow-2xl backdrop:bg-black/40"
                      >
                        <div className="flex items-start justify-between gap-2 border-b border-[hsl(var(--border))] px-4 py-3">
                          <div>
                            <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">{t(locale, "kbEditKnowledge")}</h3>
                            <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "kbEditDialogSubtitle")}</p>
                          </div>
                          <CloseDialogButton
                            dialogId={`kb-edit-${a.id}`}
                            className="rounded-lg px-2 py-1 text-sm text-[hsl(var(--muted))] hover:bg-black/5 dark:hover:bg-white/10"
                            label={t(locale, "kbDialogClose")}
                          />
                        </div>
                        <form action={updateKnowledgeAssetAction} className="max-h-[calc(90vh-120px)] space-y-3 overflow-y-auto p-4">
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="titleEn" value={a.titleEn ?? ""} />
                          <input type="hidden" name="titleZh" value={a.titleZh ?? ""} />
                          <textarea name="content" defaultValue={a.content} className="sr-only" readOnly rows={1} tabIndex={-1} aria-hidden />
                          <div className="space-y-1">
                            <label className="text-sm font-medium">{t(locale, "kbEditTitle")}</label>
                            <Input name="title" defaultValue={a.title} required className="text-sm" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-medium">{t(locale, "kbEditSummary")}</label>
                            <Input name="summary" defaultValue={a.summary ?? ""} className="text-sm" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-medium">{t(locale, "commonLayer")}</label>
                            <select
                              name="layer"
                              defaultValue={a.layer}
                              className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-sm"
                            >
                              {ORDER.map((layerOpt) => (
                                <option key={layerOpt} value={layerOpt}>
                                  {tKnowledgeLayer(locale, layerOpt)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-medium">{t(locale, "commonSourceUrl")}</label>
                            <Input name="sourceUrl" type="url" defaultValue={a.sourceUrl ?? ""} className="text-sm" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-medium">{t(locale, "kbTagsField")}</label>
                            <Input name="tags" defaultValue={a.tags ?? ""} className="text-sm" placeholder={t(locale, "kbTagsPlaceholder")} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-medium">
                              {t(locale, "commonProject")} ({t(locale, "commonOptional")})
                            </label>
                            <select
                              name="projectId"
                              defaultValue={a.projectId ?? ""}
                              className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-sm"
                            >
                              <option value="">{t(locale, "kbGeneralProject")}</option>
                              {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-medium">
                              {t(locale, "commonCompany")} ({t(locale, "commonOptional")})
                            </label>
                            <select
                              name="companyId"
                              defaultValue={a.companyId ?? ""}
                              className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-sm"
                            >
                              <option value="">{t(locale, "kbInferCompany")}</option>
                              {companies.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-wrap gap-2 pt-2">
                            <FormSubmitButton type="submit" className="min-w-[120px] flex-1">
                              {t(locale, "kbSaveChanges")}
                            </FormSubmitButton>
                            <CloseDialogButton
                              dialogId={`kb-edit-${a.id}`}
                              className="rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
                              label={t(locale, "kbDialogClose")}
                            />
                          </div>
                        </form>
                      </dialog>
                    ) : null}
                    {canMutateKb && !hubEntryLayout ? (
                      <form action={updateKnowledgeAssetAction} className="mt-2 grid gap-2 rounded-md border border-[hsl(var(--border))] p-2 md:grid-cols-2">
                        <input type="hidden" name="id" value={a.id} />
                        <div className="space-y-1 md:col-span-2">
                          <label className="text-sm font-medium">{t(locale, "kbEditTitle")}</label>
                          <Input name="title" defaultValue={a.title} required />
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium">{t(locale, "commonTitleEn")}</label>
                          <Input name="titleEn" defaultValue={a.titleEn ?? ""} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium">{t(locale, "commonTitleZh")}</label>
                          <Input name="titleZh" defaultValue={a.titleZh ?? ""} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium">{t(locale, "commonLayer")}</label>
                          <select
                            name="layer"
                            defaultValue={a.layer}
                            className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm"
                          >
                            {ORDER.map((layerOpt) => (
                              <option key={layerOpt} value={layerOpt}>
                                {tKnowledgeLayer(locale, layerOpt)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium">
                            {t(locale, "commonProject")} ({t(locale, "commonOptional")})
                          </label>
                          <select
                            name="projectId"
                            defaultValue={a.projectId ?? ""}
                            className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm"
                          >
                            <option value="">{t(locale, "kbGeneralProject")}</option>
                            {projects.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <label className="text-sm font-medium">
                            {t(locale, "commonCompany")} ({t(locale, "commonOptional")})
                          </label>
                          <select
                            name="companyId"
                            defaultValue={a.companyId ?? ""}
                            className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm"
                          >
                            <option value="">{t(locale, "kbInferCompany")}</option>
                            {companies.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <label className="text-sm font-medium">{t(locale, "kbEditSummary")}</label>
                          <Input name="summary" defaultValue={a.summary ?? ""} />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <label className="text-sm font-medium">{t(locale, "kbEditContent")}</label>
                          <textarea
                            name="content"
                            defaultValue={a.content}
                            rows={3}
                            className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium">{t(locale, "kbTagsField")}</label>
                          <Input name="tags" defaultValue={a.tags ?? ""} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium">{t(locale, "commonSourceUrl")}</label>
                          <Input name="sourceUrl" defaultValue={a.sourceUrl ?? ""} />
                        </div>
                        <div className="md:col-span-2">
                          <FormSubmitButton type="submit" variant="secondary" className="h-10 text-sm">
                            {t(locale, "kbSaveEdits")}
                          </FormSubmitButton>
                        </div>
                      </form>
                    ) : null}
                    {canMutateKb ? (
                      hubEntryLayout ? (
                        <details className="mt-2 rounded-md border border-dashed border-[hsl(var(--border))] text-sm">
                          <summary className="cursor-pointer select-none px-3 py-2 font-medium text-[hsl(var(--foreground))]">
                            {t(locale, "kbAttachments")} ({a.attachments.length})
                          </summary>
                          <div className="space-y-2 border-t border-[hsl(var(--border))] p-2">
                            <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "kbAttachHelp")}</p>
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
                                showTrash={canMutateKb}
                              />
                            ) : (
                              <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "wfNoFiles")}</p>
                            )}
                            <form
                              action={uploadKnowledgeAttachmentAction}
                              encType="multipart/form-data"
                              className="grid gap-2 border-t border-[hsl(var(--border))] pt-2 md:grid-cols-2"
                            >
                              <input type="hidden" name="knowledgeAssetId" value={a.id} />
                              <div className="space-y-1 md:col-span-2">
                                <label className="text-sm font-medium">{t(locale, "kbUploadFile")}</label>
                                <input type="file" name="file" required className="text-sm" />
                              </div>
                              <div className="space-y-1 md:col-span-2">
                                <label className="text-sm font-medium">{t(locale, "commonDescription")}</label>
                                <Input name="description" className="text-sm" />
                              </div>
                              <div className="space-y-1 md:col-span-2">
                                <label className="text-sm font-medium">{t(locale, "wfPrevVersion")}</label>
                                <select
                                  name="previousVersionId"
                                  className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm"
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
                                <FormSubmitButton type="submit" variant="secondary" className="h-10 text-sm">
                                  {t(locale, "kbUploadFile")}
                                </FormSubmitButton>
                              </div>
                            </form>
                            <form
                              action={addExternalResourceLinkAction}
                              className="grid gap-2 border-t border-[hsl(var(--border))] pt-2 md:grid-cols-2"
                            >
                              <input type="hidden" name="knowledgeAssetId" value={a.id} />
                              <div className="space-y-1 md:col-span-2">
                                <label className="text-sm font-medium">{t(locale, "resExternalUrl")}</label>
                                <Input name="externalUrl" type="url" required placeholder="https://drive.google.com/..." className="text-sm" />
                              </div>
                              <div className="space-y-1 md:col-span-2">
                                <label className="text-sm font-medium">{t(locale, "resLinkLabel")}</label>
                                <Input name="label" placeholder={t(locale, "resLinkLabelPh")} className="text-sm" />
                              </div>
                              <div className="space-y-1 md:col-span-2">
                                <label className="text-sm font-medium">{t(locale, "commonDescription")}</label>
                                <Input name="description" className="text-sm" />
                              </div>
                              <div className="space-y-1 md:col-span-2">
                                <label className="text-sm font-medium">{t(locale, "wfPrevVersion")}</label>
                                <select
                                  name="previousVersionId"
                                  className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm"
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
                                <FormSubmitButton type="submit" variant="secondary" className="h-10 text-sm">
                                  {t(locale, "resAddLink")}
                                </FormSubmitButton>
                              </div>
                            </form>
                          </div>
                        </details>
                      ) : (
                        <div className="mt-2 space-y-2 rounded-md border border-dashed border-[hsl(var(--border))] p-2">
                          <p className="text-sm font-medium">{t(locale, "kbAttachments")}</p>
                          <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "kbAttachHelp")}</p>
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
                              showTrash={canMutateKb}
                            />
                          ) : (
                            <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "wfNoFiles")}</p>
                          )}
                          <form
                            action={uploadKnowledgeAttachmentAction}
                            encType="multipart/form-data"
                            className="grid gap-2 border-t border-[hsl(var(--border))] pt-2 md:grid-cols-2"
                          >
                            <input type="hidden" name="knowledgeAssetId" value={a.id} />
                            <div className="space-y-1 md:col-span-2">
                              <label className="text-sm font-medium">{t(locale, "kbUploadFile")}</label>
                              <input type="file" name="file" required className="text-sm" />
                            </div>
                            <div className="space-y-1 md:col-span-2">
                              <label className="text-sm font-medium">{t(locale, "commonDescription")}</label>
                              <Input name="description" className="text-sm" />
                            </div>
                            <div className="space-y-1 md:col-span-2">
                              <label className="text-sm font-medium">{t(locale, "wfPrevVersion")}</label>
                              <select
                                name="previousVersionId"
                                className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm"
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
                              <FormSubmitButton type="submit" variant="secondary" className="h-10 text-sm">
                                {t(locale, "kbUploadFile")}
                              </FormSubmitButton>
                            </div>
                          </form>
                          <form
                            action={addExternalResourceLinkAction}
                            className="grid gap-2 border-t border-[hsl(var(--border))] pt-2 md:grid-cols-2"
                          >
                            <input type="hidden" name="knowledgeAssetId" value={a.id} />
                            <div className="space-y-1 md:col-span-2">
                              <label className="text-sm font-medium">{t(locale, "resExternalUrl")}</label>
                              <Input name="externalUrl" type="url" required placeholder="https://drive.google.com/..." className="text-sm" />
                            </div>
                            <div className="space-y-1 md:col-span-2">
                              <label className="text-sm font-medium">{t(locale, "resLinkLabel")}</label>
                              <Input name="label" placeholder={t(locale, "resLinkLabelPh")} className="text-sm" />
                            </div>
                            <div className="space-y-1 md:col-span-2">
                              <label className="text-sm font-medium">{t(locale, "commonDescription")}</label>
                              <Input name="description" className="text-sm" />
                            </div>
                            <div className="space-y-1 md:col-span-2">
                              <label className="text-sm font-medium">{t(locale, "wfPrevVersion")}</label>
                              <select
                                name="previousVersionId"
                                className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm"
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
                              <FormSubmitButton type="submit" variant="secondary" className="h-10 text-sm">
                                {t(locale, "resAddLink")}
                              </FormSubmitButton>
                            </div>
                          </form>
                        </div>
                      )
                    ) : null}
                  </li>
                  );
                })}
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
              {deletedAssets.map((a) => {
                const canRestoreKb = canManageKnowledgeAsset(user, a);
                const canDeleteKb = user.isSuperAdmin;
                return (
                  <li key={a.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
                    <div className="font-medium">{a.title}</div>
                    <div className="text-sm text-[hsl(var(--muted))]">
                      {t(locale, "kbByAuthor")} {a.author.name} · {a.project?.name ?? t(locale, "kbUncategorizedShort")}
                    </div>
                    {canRestoreKb || canDeleteKb ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {canRestoreKb ? (
                          <form action={restoreKnowledgeAssetAction}>
                            <input type="hidden" name="id" value={a.id} />
                            <FormSubmitButton type="submit" variant="secondary" className="h-8 px-2 text-sm">
                              {t(locale, "btnRestore")}
                            </FormSubmitButton>
                          </form>
                        ) : null}
                        {canDeleteKb ? (
                          <form action={deleteKnowledgeAssetAction}>
                            <input type="hidden" name="id" value={a.id} />
                            <FormSubmitButton
                              type="submit"
                              variant="secondary"
                              className="h-8 border-red-200 px-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30"
                            >
                              {t(locale, "btnDelete")}
                            </FormSubmitButton>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "kbNoArchived")}</p>
          )}
        </Card>
      ) : null}
    </div>
  );
}
