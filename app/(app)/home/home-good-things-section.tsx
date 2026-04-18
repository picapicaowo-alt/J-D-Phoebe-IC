import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { AccessUser } from "@/lib/access";
import { Card, CardTitle } from "@/components/ui/card";
import { getCompanionManifest } from "@/lib/companion-manifest";
import { companionPepTalkForDay } from "@/lib/companion-pep-talks";
import { getLocale } from "@/lib/locale";
import { displayRecognitionSecondary } from "@/lib/recognition-catalog";
import { t, tRecognitionTagCategory } from "@/lib/messages";

type HomeRecognition = {
  id: string;
  createdAt: Date;
  tagCategory: Parameters<typeof tRecognitionTagCategory>[1];
  secondaryLabelKey: string;
  tagLabel: string | null;
  message: string | null;
  project: {
    name: string;
    company: {
      name: string;
    };
  } | null;
  fromUser: {
    name: string;
  } | null;
  toUser: {
    name: string;
  };
};

export async function HomeGoodThingsSection({ user }: { user: AccessUser }) {
  const locale = await getLocale();
  const companyIds = [...new Set(user.companyMemberships.map((membership) => membership.companyId))];
  const recentWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recognitionSelect = {
    id: true,
    createdAt: true,
    tagCategory: true,
    secondaryLabelKey: true,
    tagLabel: true,
    message: true,
    project: {
      select: {
        name: true,
        company: {
          select: {
            name: true,
          },
        },
      },
    },
    fromUser: {
      select: {
        name: true,
      },
    },
    toUser: {
      select: {
        name: true,
      },
    },
  } as const;

  const [selfRecognitions, companion, companyRecognitions] = await Promise.all([
    prisma.recognitionEvent.findMany({
      where: { toUserId: user.id, createdAt: { gte: recentWindowStart } },
      select: recognitionSelect,
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.companionProfile.findUnique({ where: { userId: user.id } }),
    Promise.all(
      companyIds.map((companyId) =>
        prisma.recognitionEvent.findFirst({
          where: { project: { companyId } },
          select: recognitionSelect,
          orderBy: { createdAt: "desc" },
        }),
      ),
    ),
  ]);

  const pinnedRecognition = selfRecognitions[0] ?? null;
  const pinnedRecognitionCount = selfRecognitions.length;
  const companyRecognitionRows = companyRecognitions.filter((recognition): recognition is HomeRecognition => recognition !== null);
  const recognitionFeed: HomeRecognition[] = [...companyRecognitionRows]
    .filter((recognition, index, all) => all.findIndex((candidate) => candidate.id === recognition.id) === index)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  function RecognitionCard({
    recognition,
    pinned = false,
    countLink,
  }: {
    recognition: HomeRecognition;
    pinned?: boolean;
    countLink?: string;
  }) {
    const recipientName = recognition.toUser?.name ?? (locale === "zh" ? "你" : "You");
    const companyName = recognition.project?.company?.name ?? t(locale, "commonCompany");
    const projectName = recognition.project?.name ?? t(locale, "kbGeneralProject");
    return (
      <div
        className={[
          "rounded-xl border p-4 text-base",
          pinned
            ? "border-violet-100 bg-violet-50/40 dark:border-violet-900/40 dark:bg-violet-950/20"
            : "border-zinc-100 bg-white/80 dark:border-zinc-800 dark:bg-zinc-950/20",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="min-w-0 font-medium text-zinc-900 dark:text-zinc-100">{recipientName}</div>
              {countLink && pinnedRecognitionCount > 1 ? (
                <Link
                  href={countLink}
                  className="shrink-0 rounded-full border border-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-50"
                >
                  x{Math.min(pinnedRecognitionCount, 4)}
                </Link>
              ) : null}
            </div>
            <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {t(locale, "commonCompany")} · {companyName} · {t(locale, "commonProject")} · {projectName}
            </div>
          </div>
          {pinned ? (
            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center text-rose-500" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21s-7-4.35-9.5-8.71C.76 8.88 2.13 5.5 5.55 4.4c1.86-.6 3.92-.07 5.36 1.37l1.09 1.09 1.09-1.09c1.44-1.44 3.5-1.97 5.36-1.37 3.42 1.1 4.79 4.48 3.05 7.89C19 16.65 12 21 12 21z" />
              </svg>
            </span>
          ) : null}
        </div>
        <div className="mt-2 font-medium text-zinc-900 dark:text-zinc-100">
          {recognition.secondaryLabelKey
            ? displayRecognitionSecondary(recognition.tagCategory, recognition.secondaryLabelKey, locale)
            : (recognition.tagLabel ?? "")}
        </div>
        <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {tRecognitionTagCategory(locale, recognition.tagCategory)}
        </div>
        <p className="mt-2 text-base text-zinc-700 dark:text-zinc-300">
          {recognition.message ?? t(locale, "homeRecognizedDefault")}
        </p>
        <div className="mt-2 text-sm text-zinc-400">
          {t(locale, "homeFrom")} {recognition.fromUser?.name ?? "—"}
        </div>
      </div>
    );
  }

  return (
    <Card className="space-y-3 border-zinc-200/90 p-5">
      <div className="flex items-center gap-2">
        <span className="text-amber-500" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 5c-2 3-6 4-6 9a6 6 0 1012 0c0-5-4-6-6-9z" />
          </svg>
        </span>
        <CardTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{t(locale, "homeGoodThingsToday")}</CardTitle>
      </div>
      {pinnedRecognition ? (
        <RecognitionCard recognition={pinnedRecognition} pinned countLink={`/staff/${user.id}`} />
      ) : null}
      {recognitionFeed.length ? (
        <div className="max-h-[18rem] space-y-3 overflow-y-auto pr-1">
          {recognitionFeed.map((recognition) => (
            <RecognitionCard key={recognition.id} recognition={recognition} />
          ))}
        </div>
      ) : pinnedRecognition ? null : (
        <p className="text-base text-zinc-500 dark:text-zinc-400">{t(locale, "homeNoRecognition")}</p>
      )}
      {companion ? (
        <div className="flex items-center gap-3 rounded-xl border border-zinc-100 p-3 dark:border-zinc-800">
          {(() => {
            const asset = getCompanionManifest().find((e) => e.species === companion.species);
            return asset ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={asset.file} alt="" width={48} height={48} className="h-12 w-12 rounded-2xl object-contain" />
            ) : null;
          })()}
          <div className="min-w-0 space-y-2">
            <p className="text-base text-zinc-600 dark:text-zinc-300">
              {t(locale, "homeCompanionLine")}: {companion.name ?? (locale === "zh" ? "小伙伴" : "Companion")} · {t(locale, "homeMood")}{" "}
              {companion.mood} · {t(locale, "homeLevel")} {companion.level}
            </p>
            <p className="text-base leading-relaxed text-zinc-700 dark:text-zinc-200">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{t(locale, "homeCompanionEncouragement")}: </span>
              {companionPepTalkForDay(locale, user.id, user.timezone)}
            </p>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
