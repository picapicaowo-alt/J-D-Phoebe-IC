"use client";

import { useMemo, useState } from "react";
import type { FeedbackCategory } from "@prisma/client";
import { FEEDBACK_SECONDARY_LABELS } from "@/lib/feedback-catalog";

const CATEGORIES = Object.keys(FEEDBACK_SECONDARY_LABELS) as FeedbackCategory[];

type Props = {
  defaultCategory?: FeedbackCategory;
  locale?: "en" | "zh";
};

export function FeedbackSecondarySelect({ defaultCategory = "COMMUNICATION", locale = "en" }: Props) {
  const [cat, setCat] = useState<FeedbackCategory>(defaultCategory);
  const options = useMemo(() => FEEDBACK_SECONDARY_LABELS[cat] ?? [], [cat]);

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
          key={cat}
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
