"use client";

import { useMemo, useState } from "react";
import type { RecognitionTagCategory } from "@prisma/client";
import { RECOGNITION_SECONDARY_LABELS } from "@/lib/recognition-catalog";

const CATEGORIES = Object.keys(RECOGNITION_SECONDARY_LABELS) as RecognitionTagCategory[];

type Props = {
  defaultCategory?: RecognitionTagCategory;
  locale?: "en" | "zh";
};

export function RecognitionSecondarySelect({ defaultCategory = "COLLABORATION", locale = "en" }: Props) {
  const [cat, setCat] = useState<RecognitionTagCategory>(defaultCategory);
  const options = useMemo(() => RECOGNITION_SECONDARY_LABELS[cat] ?? [], [cat]);

  return (
    <div className="grid gap-2 md:grid-cols-2">
      <div className="space-y-1">
        <label className="text-xs font-medium">Primary category</label>
        <select
          name="tagCategory"
          value={cat}
          onChange={(e) => setCat(e.target.value as RecognitionTagCategory)}
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
        <label className="text-xs font-medium">Secondary label</label>
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
