import { prisma } from "@/lib/prisma";
import type { AccessUser } from "@/lib/access";
import { Card, CardTitle } from "@/components/ui/card";
import { getCompanionManifest } from "@/lib/companion-manifest";
import { companionPepTalkForDay } from "@/lib/companion-pep-talks";
import { getLocale } from "@/lib/locale";
import { displayRecognitionSecondary } from "@/lib/recognition-catalog";
import { t, tRecognitionTagCategory } from "@/lib/messages";

export async function HomeGoodThingsSection({ user }: { user: AccessUser }) {
  const locale = await getLocale();
  const [latestRec, companion] = await Promise.all([
    prisma.recognitionEvent.findFirst({
      where: { toUserId: user.id },
      include: { project: true, fromUser: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.companionProfile.findUnique({ where: { userId: user.id } }),
  ]);

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
      {latestRec ? (
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4 text-base dark:border-violet-900/40 dark:bg-violet-950/20">
          <div className="font-medium text-zinc-900 dark:text-zinc-100">
            {latestRec.secondaryLabelKey
              ? displayRecognitionSecondary(latestRec.tagCategory, latestRec.secondaryLabelKey, locale)
              : (latestRec.tagLabel ?? "")}
          </div>
          <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {tRecognitionTagCategory(locale, latestRec.tagCategory)} · {latestRec.project?.name ?? t(locale, "kbGeneralProject")}
          </div>
          <p className="mt-2 text-base text-zinc-700 dark:text-zinc-300">{latestRec.message ?? t(locale, "homeRecognizedDefault")}</p>
          <div className="mt-2 text-sm text-zinc-400">
            {t(locale, "homeFrom")} {latestRec.fromUser?.name ?? "—"}
          </div>
        </div>
      ) : (
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
