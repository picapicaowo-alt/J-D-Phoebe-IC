"use client";

import { useEffect, useMemo, useState } from "react";
import type { FeedbackCategory } from "@prisma/client";
import { FEEDBACK_SECONDARY_LABELS } from "@/lib/feedback-catalog";

const CATEGORIES = Object.keys(FEEDBACK_SECONDARY_LABELS) as FeedbackCategory[];

type Props = {
  defaultCategory?: FeedbackCategory;
  defaultSecondaryKey?: string;
  locale?: "en" | "zh";
};

export function FeedbackSecondarySelect({
  defaultCategory = "COMMUNICATION",
  defaultSecondaryKey,
  locale = "en",
}: Props) {
  const [cat, setCat] = useState<FeedbackCategory>(defaultCategory);
  const options = useMemo(() => FEEDBACK_SECONDARY_LABELS[cat] ?? [], [cat]);
  const [secondaryKey, setSecondaryKey] = useState(() => {
    const initialOptions = FEEDBACK_SECONDARY_LABELS[defaultCategory] ?? [];
    return initialOptions.some((option) => option.key === defaultSecondaryKey)
      ? defaultSecondaryKey!
      : (initialOptions[0]?.key ?? "");
  });

  useEffect(() => {
    setSecondaryKey((current) =>
      options.some((option) => option.key === current) ? current : (options[0]?.key ?? ""),
    );
  }, [options]);

  return (
    <div className="grid gap-2 md:grid-cols-2">
      <div className="space-y-1">
        <label className="text-xs font-medium">Observation area</label>
        <select
          name="category"
          value={cat}
          onChange={(e) => setCat(e.target.value as FeedbackCategory)}
          className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm"
          required
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium">Structured label</label>
        <select
          name="secondaryLabelKey"
          value={secondaryKey}
          onChange={(e) => setSecondaryKey(e.target.value)}
          className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm"
          required
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {locale === "zh" ? o.label_zh : o.label_en}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
