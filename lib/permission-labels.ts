import type { Locale } from "./locale";
import type { PermissionKey } from "./permission-keys";
import { PERMISSION_KEYS } from "./permission-keys";

/** Human-readable labels for the permission matrix (EN/ZH). */
const PERM: Record<PermissionKey, { en: string; zh: string }> = {
  "org.group.read": { en: "View org group", zh: "查看集团" },
  "org.group.update": { en: "Edit org group", zh: "编辑集团" },
  "company.create": { en: "Create company", zh: "创建公司" },
  "company.read": { en: "View companies", zh: "查看公司" },
  "company.update": { en: "Edit company", zh: "编辑公司" },
  "company.archive": { en: "Archive company", zh: "归档公司" },
  "company.restore": { en: "Restore company", zh: "恢复公司" },
  "company.soft_delete": { en: "Trash company", zh: "删除公司到回收站" },
  "company.purge": { en: "Purge company", zh: "永久清除公司" },
  "project.create": { en: "Create project", zh: "创建项目" },
  "project.read": { en: "View projects", zh: "查看项目" },
  "project.update": { en: "Edit project", zh: "编辑项目" },
  "project.archive": { en: "Archive project", zh: "归档项目" },
  "project.restore": { en: "Restore project", zh: "恢复项目" },
  "project.soft_delete": { en: "Trash project", zh: "删除项目到回收站" },
  "project.purge": { en: "Purge project", zh: "永久清除项目" },
  "project.workflow.read": { en: "View workflow", zh: "查看工作流" },
  "project.workflow.update": { en: "Edit workflow", zh: "编辑工作流" },
  "project.map.update": { en: "Edit project map", zh: "编辑项目地图" },
  "project.member.manage": { en: "Manage project members", zh: "管理项目成员" },
  "recognition.read": { en: "View recognition", zh: "查看认可" },
  "recognition.create": { en: "Give recognition", zh: "发出认可" },
  "feedback.submit": { en: "Submit feedback", zh: "提交反馈" },
  "feedback.read": { en: "View feedback", zh: "查看反馈" },
  "leaderboard.read": { en: "View leaderboards", zh: "查看榜单" },
  "knowledge.read": { en: "View knowledge", zh: "查看知识库" },
  "knowledge.create": { en: "Create knowledge", zh: "创建知识条目" },
  "staff.create": { en: "Create staff", zh: "创建成员" },
  "staff.read": { en: "View staff", zh: "查看成员" },
  "staff.update": { en: "Edit staff", zh: "编辑成员" },
  "staff.assign_company": { en: "Assign company role", zh: "分配公司角色" },
  "staff.assign_project": { en: "Assign project role", zh: "分配项目角色" },
  "staff.soft_delete": { en: "Trash user", zh: "删除成员到回收站" },
  "staff.restore": { en: "Restore user", zh: "恢复成员" },
  "staff.purge": { en: "Purge user", zh: "永久清除成员" },
  "role.display_name.update": { en: "Edit role display names", zh: "编辑角色显示名" },
  "permission.matrix.read": { en: "View permission matrix", zh: "查看权限矩阵" },
  "permission.matrix.update": { en: "Edit permission matrix", zh: "编辑权限矩阵" },
  "trash.read": { en: "View trash", zh: "查看回收站" },
  "trash.restore": { en: "Restore from trash", zh: "从回收站恢复" },
  "trash.purge": { en: "Purge trash", zh: "永久清除回收站项" },
  "lifecycle.onboarding.skip": { en: "Skip member onboarding gate", zh: "跳过入职拦截（管理用）" },
  "lifecycle.onboarding.hub": { en: "View onboarding hub", zh: "查看入职中心" },
  "lifecycle.hr.pipeline": { en: "HR lifecycle inbox (triggers)", zh: "HR 生命周期收件（触发提醒）" },
  "lifecycle.email.send": { en: "Send lifecycle emails (system)", zh: "发送生命周期系统邮件" },
};

export function describePermissionKey(locale: Locale, key: string): string {
  if (PERMISSION_KEYS.includes(key as PermissionKey)) {
    const row = PERM[key as PermissionKey];
    return locale === "zh" ? row.zh : row.en;
  }
  return key;
}
