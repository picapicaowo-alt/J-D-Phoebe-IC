"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { updateOnboardingVideoProgressAction } from "@/app/actions/lifecycle";
import type { Locale } from "@/lib/locale";
import { t } from "@/lib/messages";

function toYouTubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace(/^\//, "");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      return v ? `https://www.youtube.com/embed/${v}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

function isLikelyDirectVideo(url: string) {
  const low = url.toLowerCase();
  return low.endsWith(".mp4") || low.endsWith(".webm") || low.endsWith(".ogg") || low.includes(".mp4?");
}

type Props = {
  onboardingId: string;
  videoUrl: string;
  completed: boolean;
  progressSeconds: number;
  locale: Locale;
  forceDirect?: boolean;
};

export function OnboardingVideoPanel({ onboardingId, videoUrl, completed, progressSeconds, locale, forceDirect = false }: Props) {
  const lastSent = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const embed = useMemo(() => toYouTubeEmbed(videoUrl), [videoUrl]);
  const direct = useMemo(() => forceDirect || isLikelyDirectVideo(videoUrl), [forceDirect, videoUrl]);

  const sendHtml5 = useCallback(
    async (watchedSeconds: number, durationSeconds: number) => {
      const fd = new FormData();
      fd.set("onboardingId", onboardingId);
      fd.set("mode", "html5");
      fd.set("watchedSeconds", String(Math.floor(watchedSeconds)));
      fd.set("durationSeconds", String(Math.floor(durationSeconds)));
      await updateOnboardingVideoProgressAction(fd);
    },
    [onboardingId],
  );

  const sendDwell = useCallback(
    async (delta: number) => {
      const fd = new FormData();
      fd.set("onboardingId", onboardingId);
      fd.set("mode", "dwell");
      fd.set("dwellDeltaSeconds", String(delta));
      await updateOnboardingVideoProgressAction(fd);
    },
    [onboardingId],
  );

  useEffect(() => {
    if (completed || direct) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void sendDwell(3);
    }, 3000);
    return () => window.clearInterval(id);
  }, [completed, direct, sendDwell]);

  const onTimeUpdate = useCallback(() => {
    if (completed) return;
    const el = videoRef.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    const now = Date.now();
    if (now - lastSent.current < 4000) return;
    lastSent.current = now;
    void sendHtml5(el.currentTime, el.duration);
  }, [completed, sendHtml5]);

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">{t(locale, "onboardingVideoTitle")}</p>
      <p className="mt-2 text-base leading-relaxed text-[hsl(var(--muted))]">{t(locale, "onboardingVideoHelp")}</p>
      <div className="mt-4 overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-black/5 dark:bg-black/30">
        {direct ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- onboarding; optional captions from HR URL
          <video
            ref={videoRef}
            className="max-h-[420px] w-full"
            src={videoUrl}
            controls
            playsInline
            onTimeUpdate={onTimeUpdate}
          />
        ) : embed ? (
          <iframe className="aspect-video w-full" src={embed} title="Onboarding video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        ) : (
          <div className="p-4 text-center text-sm text-[hsl(var(--muted))]">
            <a href={videoUrl} target="_blank" rel="noreferrer" className="font-medium text-[hsl(var(--primary))] underline">
              {t(locale, "onboardingVideoOpenLink")}
            </a>
          </div>
        )}
      </div>
      {completed ? (
        <p className="mt-3 text-base font-medium text-emerald-700 dark:text-emerald-300">{t(locale, "onboardingVideoCompleted")}</p>
      ) : (
        <p className="mt-3 text-sm text-[hsl(var(--muted))]">
          {embed
            ? t(locale, "onboardingVideoEmbedProgress").replace("{s}", String(progressSeconds))
            : direct
              ? t(locale, "onboardingVideoHtml5Hint")
              : t(locale, "onboardingVideoExternalHint")}
        </p>
      )}
    </div>
  );
}
