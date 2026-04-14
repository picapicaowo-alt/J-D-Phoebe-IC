import type { RecognitionTagCategory } from "@prisma/client";

export type RecognitionLabelDef = {
  key: string;
  label_en: string;
  label_zh: string;
};

export const RECOGNITION_SECONDARY_LABELS: Record<RecognitionTagCategory, RecognitionLabelDef[]> = {
  RESULT: [
    { key: "milestone_delivery", label_en: "Milestone delivery", label_zh: "里程碑交付" },
    { key: "quality_outcome", label_en: "Quality outcome", label_zh: "质量成果" },
    { key: "speed_with_care", label_en: "Speed with care", label_zh: "又快又稳" },
  ],
  COLLABORATION: [
    { key: "backup_support", label_en: "Backup support", label_zh: "补位支持" },
    { key: "cross_team_bridge", label_en: "Cross-team bridge", label_zh: "跨团队衔接" },
    { key: "efficient_handoff", label_en: "Efficient handoff", label_zh: "高效交接" },
  ],
  THINKING: [
    { key: "good_judgment", label_en: "Good judgment", label_zh: "判断清晰" },
    { key: "risk_awareness", label_en: "Risk awareness", label_zh: "风险意识" },
    { key: "structured_analysis", label_en: "Structured analysis", label_zh: "结构化分析" },
  ],
  CREATIVITY: [
    { key: "fresh_approach", label_en: "Fresh approach", label_zh: "新思路" },
    { key: "clear_storytelling", label_en: "Clear storytelling", label_zh: "表达清楚" },
    { key: "visual_clarity", label_en: "Visual clarity", label_zh: "呈现清晰" },
  ],
  CULTURE: [
    { key: "calm_collaboration", label_en: "Calm collaboration", label_zh: "温和协作" },
    { key: "inclusive_tone", label_en: "Inclusive tone", label_zh: "包容沟通" },
    { key: "values_in_action", label_en: "Values in action", label_zh: "价值观践行" },
  ],
  STABILITY: [
    { key: "reliable_rhythm", label_en: "Reliable rhythm", label_zh: "节奏可靠" },
    { key: "consistent_quality", label_en: "Consistent quality", label_zh: "质量稳定" },
    { key: "steady_under_pressure", label_en: "Steady under pressure", label_zh: "压力下稳定" },
  ],
  GUIDANCE: [
    { key: "mentoring_moment", label_en: "Mentoring moment", label_zh: "带教支持" },
    { key: "clear_direction", label_en: "Clear direction", label_zh: "方向清楚" },
    { key: "safe_escalation", label_en: "Safe escalation", label_zh: "稳妥升级" },
  ],
};

export function getRecognitionLabelDef(category: RecognitionTagCategory, key: string): RecognitionLabelDef | undefined {
  return RECOGNITION_SECONDARY_LABELS[category]?.find((l) => l.key === key);
}

export function displayRecognitionSecondary(category: RecognitionTagCategory, key: string, locale: "en" | "zh") {
  const def = getRecognitionLabelDef(category, key);
  if (!def) return key;
  return locale === "zh" ? def.label_zh : def.label_en;
}
