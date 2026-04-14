"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { CompanyStatus } from "@prisma/client";
import type { Locale } from "@/lib/locale";
import { t, tCompanyStatus } from "@/lib/messages";

export type CompanyRow = {
  id: string;
  name: string;
  status: CompanyStatus;
  companyType: string | null;
  introduction: string | null;
  logoUrl: string | null;
  projects: number;
  members: number;
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
          <Link key={c.id} href={`/companies/${c.id}`} className="group block">
            <Card className="h-full border-zinc-200/90 p-5 shadow-sm transition hover:border-zinc-300 hover:shadow-md dark:border-zinc-700">
              <div className="flex gap-3">
                <CompanyAvatar name={c.name} logoUrl={c.logoUrl} index={i} />
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold tracking-tight text-zinc-900 group-hover:underline dark:text-zinc-50">
                    {c.name}
                  </h2>
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
            </Card>
          </Link>
        ))}
      </div>
      {!filtered.length ? <p className="text-center text-sm text-zinc-500">{t(locale, "companiesSearchEmpty")}</p> : null}
    </div>
  );
}
