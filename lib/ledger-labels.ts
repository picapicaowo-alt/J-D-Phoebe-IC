import type { Locale } from "./locale";

const REASONS: Record<string, { en: string; zh: string }> = {
  node_completed_on_time: { en: "Node completed on time", zh: "节点按时完成" },
  node_completed_late: { en: "Node completed after due date", zh: "节点逾期后完成" },
  node_overdue_while_open: { en: "Open node past due date", zh: "节点逾期未关闭" },
  recognition_received: { en: "Recognition received", zh: "收到认可" },
  knowledge_reused: { en: "Knowledge reused by others", zh: "知识被他人复用" },
};

export function tLedgerReason(locale: Locale, reasonKey: string): string {
  const row = REASONS[reasonKey];
  if (row) return locale === "zh" ? row.zh : row.en;
  if (reasonKey.startsWith("feedback_")) {
    return locale === "zh" ? `反馈 · ${reasonKey.replace(/^feedback_/, "")}` : `Feedback · ${reasonKey.replace(/^feedback_/, "")}`;
  }
  if (reasonKey.startsWith("recognition_")) {
    return locale === "zh" ? `认可 · ${reasonKey.replace(/^recognition_/, "")}` : `Recognition · ${reasonKey.replace(/^recognition_/, "")}`;
  }
  return reasonKey;
}
