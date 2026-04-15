import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { KnowledgeLayer } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import type { AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLocale, type Locale } from "@/lib/locale";
import { t, tKnowledgeLayer, type MessageKey } from "@/lib/messages";

const ORDER: KnowledgeLayer[] = [
  "TEMPLATE_PLAYBOOK",
  "REFERENCE_RESOURCE",
  "INTERNAL_INSIGHT",
  "REUSABLE_OUTPUT",
];

const LAYER_CARD: Record<KnowledgeLayer, { iconWrap: string; footer: string }> = {
  TEMPLATE_PLAYBOOK: {
    iconWrap: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
    footer: "text-sky-700 dark:text-sky-300",
  },
  REFERENCE_RESOURCE: {
    iconWrap: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
    footer: "text-violet-700 dark:text-violet-300",
  },
  INTERNAL_INSIGHT: {
    iconWrap: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200",
    footer: "text-amber-800 dark:text-amber-200",
  },
  REUSABLE_OUTPUT: {
    iconWrap: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
    footer: "text-emerald-800 dark:text-emerald-200",
  },
};

const LAYER_CARD_DESC: Record<KnowledgeLayer, MessageKey> = {
  TEMPLATE_PLAYBOOK: "kbLayerCardDesc_TEMPLATE_PLAYBOOK",
  REFERENCE_RESOURCE: "kbLayerCardDesc_REFERENCE_RESOURCE",
  INTERNAL_INSIGHT: "kbLayerCardDesc_INTERNAL_INSIGHT",
  REUSABLE_OUTPUT: "kbLayerCardDesc_REUSABLE_OUTPUT",
};

function IconBook({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 19.5A2.5 2.5 0 016.5 17H20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconDoc({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconLink({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 13a5 5 0 007.07 0l1.42-1.42a5 5 0 00-7.07-7.07L9 6M14 11a5 5 0 00-7.07 0L5.51 12.42a5 5 0 007.07 7.07L15 18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconBulb({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 18h6M10 22h4M12 2a7 7 0 00-3 13.3V17h6v-1.7A7 7 0 0012 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCube({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2l8 4.5v9L12 22l-8-4.5v-9L12 2zM12 22V12M12 12L4 7.5M12 12l8-4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const LAYER_ICON: Record<KnowledgeLayer, ReactNode> = {
  TEMPLATE_PLAYBOOK: <IconDoc />,
  REFERENCE_RESOURCE: <IconLink />,
  INTERNAL_INSIGHT: <IconBulb />,
  REUSABLE_OUTPUT: <IconCube />,
};

function layerShortLabel(locale: Locale, layer: KnowledgeLayer): string {
  const full = tKnowledgeLayer(locale, layer);
  if (layer === "INTERNAL_INSIGHT") return full.replace(/\s*\/\s*Notes?/i, "").trim() || full;
  return full.split("/")[0]?.trim() || full;
}

export default async function KnowledgeHubPage() {
  const user = (await requireUser()) as AccessUser;
  if (!(await userHasPermission(user, "knowledge.read"))) redirect("/home");
  const locale = await getLocale();

  const [layerGroups, recent, canCreate] = await Promise.all([
    prisma.knowledgeAsset.groupBy({
      by: ["layer"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.knowledgeAsset.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { author: true },
    }),
    userHasPermission(user, "knowledge.create"),
  ]);

  const countByLayer = ORDER.reduce(
    (acc, layer) => {
      acc[layer] = 0;
      return acc;
    },
    {} as Record<KnowledgeLayer, number>,
  );
  for (const row of layerGroups) {
    countByLayer[row.layer] = row._count._all;
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10 text-[hsl(var(--foreground))]">
            <IconBook />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">{t(locale, "knowledgeHubTitle")}</h1>
            <p className="mt-1 max-w-2xl text-sm text-[hsl(var(--muted))]">{t(locale, "knowledgeHubSubtitle")}</p>
          </div>
        </div>
        {canCreate ? (
          <Link href="/knowledge/browse#knowledge-create">
            <Button type="button" className="rounded-[10px] px-5">
              + {t(locale, "knowledgeAddNew")}
            </Button>
          </Link>
        ) : null}
      </div>

      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10 p-4">
        <form action="/knowledge/browse" method="get" className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted))]">
            <IconSearch />
          </span>
          <Input
            name="q"
            placeholder={t(locale, "kbSearchKnowledgeBasePh")}
            className="h-11 rounded-[10px] border-[hsl(var(--border))] bg-[hsl(var(--card))] pl-10 pr-4 text-sm shadow-sm"
          />
        </form>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">{t(locale, "kbBrowseByCategoryTitle")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {ORDER.map((layer) => {
            const style = LAYER_CARD[layer];
            const n = countByLayer[layer];
            return (
              <Link key={layer} href={`/knowledge/browse?layer=${layer}`} className="group block">
                <div className="flex h-full flex-col rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm transition hover:border-[hsl(var(--foreground))]/15 hover:shadow-md">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${style.iconWrap}`}>{LAYER_ICON[layer]}</div>
                  <h3 className="mt-4 text-base font-semibold text-[hsl(var(--foreground))]">{tKnowledgeLayer(locale, layer)}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-[hsl(var(--muted))]">{t(locale, LAYER_CARD_DESC[layer])}</p>
                  <p className={`mt-4 text-sm font-medium ${style.footer}`}>
                    {t(locale, "kbCardItemsLink").replace("{n}", String(n))} →
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">{t(locale, "knowledgeRecent")}</h2>
        {recent.length ? (
          <ul className="mt-4 divide-y divide-[hsl(var(--border))]">
            {recent.map((a) => {
              const style = LAYER_CARD[a.layer];
              const dateStr = a.createdAt.toISOString().slice(0, 10);
              return (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0">
                  <div className="min-w-0">
                    <Link
                      href={`/knowledge/browse?layer=${a.layer}&q=${encodeURIComponent(a.title)}`}
                      className="font-semibold text-[hsl(var(--foreground))] hover:underline"
                    >
                      {a.title}
                    </Link>
                    <p className="mt-1 text-xs text-[hsl(var(--muted))]">
                      <span className={`font-medium ${style.footer}`}>{layerShortLabel(locale, a.layer)}</span>
                      {" · "}
                      {t(locale, "kbByAuthor")} {a.author.name}
                      {" · "}
                      {dateStr}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm text-emerald-700 dark:text-emerald-400">
                    {t(locale, "kbReusedNTimes").replace("{n}", String(a.reuseCount))}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-[hsl(var(--muted))]">{t(locale, "kbNoAssetsInLayer")}</p>
        )}
        {!canCreate ? (
          <p className="mt-4 text-xs text-[hsl(var(--muted))]">{t(locale, "kbNoCreatePermission")}</p>
        ) : null}
      </section>
    </div>
  );
}
