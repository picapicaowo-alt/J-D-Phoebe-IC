import type { FeedbackCategory } from "@prisma/client";

export type FeedbackLabelDef = {
  key: string;
  label_en: string;
  label_zh: string;
};

export const FEEDBACK_SECONDARY_LABELS: Record<FeedbackCategory, FeedbackLabelDef[]> = {
  COMMUNICATION: [
    { key: "unclear_communication", label_en: "Unclear communication", label_zh: "沟通不够清晰" },
    { key: "missing_context", label_en: "Missing context", label_zh: "缺少背景信息" },
  ],
  DELIVERY_QUALITY: [
    { key: "unstable_delivery", label_en: "Unstable delivery quality", label_zh: "交付质量波动" },
    { key: "needs_review_depth", label_en: "Needs deeper review", label_zh: "需要更细致复核" },
  ],
  FOLLOW_THROUGH: [
    { key: "delayed_follow_through", label_en: "Delayed follow-through", label_zh: "跟进偏慢" },
    { key: "missed_commitment", label_en: "Missed commitment", label_zh: "承诺未兑现" },
  ],
  DOCUMENTATION: [
    { key: "missing_documentation", label_en: "Missing documentation", label_zh: "文档不足" },
    { key: "handoff_gaps", label_en: "Handoff gaps", label_zh: "交接信息缺口" },
  ],
  COLLABORATION_RESPONSIVENESS: [
    { key: "slow_responsiveness", label_en: "Slow collaboration responsiveness", label_zh: "协作响应偏慢" },
    { key: "blocked_others", label_en: "Blocked others unintentionally", label_zh: "无意中阻塞他人" },
  ],
};

export function getFeedbackLabelDef(category: FeedbackCategory, key: string): FeedbackLabelDef | undefined {
  return FEEDBACK_SECONDARY_LABELS[category]?.find((l) => l.key === key);
}

export function displayFeedbackSecondary(category: FeedbackCategory, key: string, locale: "en" | "zh") {
  const def = getFeedbackLabelDef(category, key);
  if (!def) return key;
  return locale === "zh" ? def.label_zh : def.label_en;
}
