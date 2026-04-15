"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { ProjectStatus } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CompanyStatus } from "@prisma/client";
import type { Locale } from "@/lib/locale";
import { t, tCompanyStatus, tProjectStatus } from "@/lib/messages";

export type CompanyRow = {
  id: string;
  name: string;
  status: CompanyStatus;
  companyType: string | null;
  introduction: string | null;
  logoUrl: string | null;
  projects: number;
  members: number;
  activeProjects: { id: string; name: string; status: ProjectStatus; progressPercent: number }[];
};

const gradients = [
  "from-violet-500 to-indigo-600",
  "from-sky-500 to-blue-600",
  "from-fuchsia-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-red-600",
];

function CompanyAvatar({ name, logoUrl, index }: { name: string; logoUrl: string | null; index: number }) {
  const initial = name.trim().slice(0, 1).toUpperCase() || "?";
  const g = gradients[index % gradients.length]!;
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        className="h-12 w-12 shrink-0 rounded-xl border border-zinc-200/80 bg-white object-contain p-0.5 dark:border-zinc-700"
      />
    );
  }
  return (
    <div
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white shadow-sm ${g}`}
      aria-hidden
    >
      {initial}
    </div>
  );
}

function CompanyPreviewCard({ c, index, locale }: { c: CompanyRow; index: number; locale: Locale }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <Card className="h-full border-zinc-200/90 p-5 shadow-sm dark:border-zinc-700">
      <button
        type="button"
        className="w-full text-left"
        onClick={() => dialogRef.current?.showModal()}
      >
        <div className="flex gap-3">
          <CompanyAvatar name={c.name} logoUrl={c.logoUrl} index={index} />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold tracking-tight text-zinc-900 group-hover:underline dark:text-zinc-50">{c.name}</h2>
            {c.companyType ? (
              <span className="mt-1 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {c.companyType}
              </span>
            ) : (
              <span className="mt-1 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800">
                {tCompanyStatus(locale, c.status)}
              </span>
            )}
          </div>
        </div>
        {c.introduction ? (
          <p className="mt-3 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">{c.introduction}</p>
        ) : (
          <p className="mt-3 text-sm text-zinc-400 dark:text-zinc-500">{t(locale, "companiesCardNoIntro")}</p>
        )}
        <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            {c.members} {t(locale, "companiesUnitMembers")}
          </span>
          <span className="inline-flex items-center gap-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            {c.projects} {t(locale, "companiesUnitProjects")}
          </span>
        </div>
        <p className="mt-2 text-center text-xs font-medium text-sky-600 dark:text-sky-400">{t(locale, "companyPreviewTapHint")}</p>
      </button>

      <dialog
        ref={dialogRef}
        className="app-modal-dialog z-[200] max-h-[min(90vh,720px)] w-[min(100vw-2rem,560px)] overflow-hidden rounded-2xl border border-zinc-200 bg-white p-0 shadow-2xl backdrop:bg-black/40 dark:border-zinc-700 dark:bg-zinc-950"
      >
        <div className="max-h-[min(90vh,720px)] overflow-y-auto">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
            <div className="flex items-start gap-3">
              <CompanyAvatar name={c.name} logoUrl={c.logoUrl} index={index} />
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{c.name}</h2>
                <div className="mt-1 flex flex-wrap gap-2">
                  {c.companyType ? (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {c.companyType}
                    </span>
                  ) : null}
                  <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                    {tCompanyStatus(locale, c.status)}
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              onClick={() => dialogRef.current?.close()}
              aria-label={t(locale, "kbDialogClose")}
            >
              ✕
            </button>
          </div>
          {c.introduction ? (
            <p className="border-b border-zinc-100 px-5 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
              {c.introduction}
            </p>
          ) : null}
          <div className="px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{t(locale, "companyPreviewActiveProjects")}</h3>
              <Link href={`/projects/new?companyId=${c.id}`} onClick={() => dialogRef.current?.close()}>
                <Button type="button" className="h-8 rounded-lg px-3 text-xs">
                  + {t(locale, "companyNewProjectHere")}
                </Button>
              </Link>
            </div>
            <ul className="space-y-3">
              {c.activeProjects.length ? (
                c.activeProjects.map((p) => {
                  const pct = Math.max(0, Math.min(100, p.progressPercent));
                  return (
                    <li key={p.id} className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/projects/${p.id}`}
                          className="text-sm font-semibold text-zinc-900 hover:underline dark:text-zinc-50"
                          onClick={() => dialogRef.current?.close()}
                        >
                          {p.name}
                        </Link>
                        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-300 dark:ring-zinc-700">
                          {tProjectStatus(locale, p.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-zinc-500">{t(locale, "companyModalProgressLine").replace("{n}", String(pct))}</p>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                        <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })
              ) : (
                <p className="text-sm text-zinc-500">{t(locale, "companyNoProjectsYet")}</p>
              )}
            </ul>
            <div className="mt-5 flex justify-end border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <Link href={`/companies/${c.id}`} onClick={() => dialogRef.current?.close()}>
                <Button type="button" variant="secondary" className="text-xs">
                  {t(locale, "companyPreviewOpenFull")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </dialog>
    </Card>
  );
}

export function CompaniesBrowser({ companies, locale }: { companies: CompanyRow[]; locale: Locale }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return companies;
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        (c.companyType ?? "").toLowerCase().includes(s) ||
        (c.introduction ?? "").toLowerCase().includes(s),
    );
  }, [companies, q]);

  return (
    <div className="space-y-6">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        </span>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t(locale, "companiesSearchPlaceholder")}
          className="h-11 rounded-xl border-zinc-200 bg-zinc-50 pl-10 text-sm shadow-none dark:border-zinc-700 dark:bg-zinc-900/50"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((c, i) => (
          <CompanyPreviewCard key={c.id} c={c} index={i} locale={locale} />
        ))}
      </div>
      {!filtered.length ? <p className="text-center text-sm text-zinc-500">{t(locale, "companiesSearchEmpty")}</p> : null}
    </div>
  );
}
