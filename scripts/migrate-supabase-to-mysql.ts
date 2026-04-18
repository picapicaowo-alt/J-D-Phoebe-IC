/**
 * One-shot data migration: Supabase (PostgreSQL) → MySQL
 * Reads every table via pg, writes via Prisma (MySQL).
 * Clears MySQL data first, then inserts in FK-safe order.
 */
import { Client } from "pg";
import { PrismaClient } from "@prisma/client";

const SUPABASE_URL =
  "postgresql://postgres.bzxkzzzuvotssbcqxyto:Picapica-123@aws-1-us-east-2.pooler.supabase.com:5432/postgres";

const pg = new Client(SUPABASE_URL);
const prisma = new PrismaClient();

async function q<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const res = await pg.query(sql);
  return res.rows as T[];
}

function toJson(val: unknown): string {
  if (val === null || val === undefined) return "[]";
  if (Array.isArray(val)) return JSON.stringify(val);
  return String(val);
}

async function main() {
  await pg.connect();
  console.log("Connected to Supabase");

  // ── 1. Clear MySQL in reverse FK order ──────────────────────────────────
  console.log("\nClearing MySQL tables...");
  await prisma.$transaction([
    prisma.offboardingChecklistItem.deleteMany(),
    prisma.offboardingRun.deleteMany(),
    prisma.memberOutput.deleteMany(),
    prisma.lifecycleReminderLog.deleteMany(),
    prisma.lifecycleTriggerFire.deleteMany(),
    prisma.lifecycleTriggerRule.deleteMany(),
    prisma.messageGroupMessageAttachment.deleteMany(),
    prisma.messageGroupMessage.deleteMany(),
    prisma.messageGroupMember.deleteMany(),
    prisma.messageGroup.deleteMany(),
    prisma.directMessageAttachment.deleteMany(),
    prisma.directMessage.deleteMany(),
    prisma.directMessagePreference.deleteMany(),
    prisma.feedbackEvent.deleteMany(),
    prisma.staffInvite.deleteMany(),
    prisma.auditLogEntry.deleteMany(),
    prisma.inAppNotification.deleteMany(),
    prisma.attachment.deleteMany(),
    prisma.scoreLedgerEntry.deleteMany(),
    prisma.recognitionEvent.deleteMany(),
    prisma.performanceSnapshot.deleteMany(),
    prisma.knowledgeReuseEvent.deleteMany(),
    prisma.knowledgeAsset.deleteMany(),
    prisma.calendarAttendee.deleteMany(),
    prisma.calendarEvent.deleteMany(),
    prisma.calendarLabel.deleteMany(),
    prisma.memberOnboardingChecklistItem.deleteMany(),
    prisma.companyOnboardingMaterial.deleteMany(),
    prisma.memberOnboarding.deleteMany(),
    prisma.companionProfile.deleteMany(),
    prisma.workflowNodeWaitingUser.deleteMany(),
    prisma.workflowNodeAssignee.deleteMany(),
    prisma.workflowEdge.deleteMany(),
    prisma.workflowNode.deleteMany(),
    prisma.workflowLayer.deleteMany(),
    prisma.projectRelationSharedKnowledge.deleteMany(),
    prisma.projectRelationSharedAttachment.deleteMany(),
    prisma.projectRelation.deleteMany(),
    prisma.projectMembership.deleteMany(),
    prisma.project.deleteMany(),
    prisma.projectGroup.deleteMany(),
    prisma.rolePermission.deleteMany(),
    prisma.companyMembership.deleteMany(),
    prisma.groupMembership.deleteMany(),
    prisma.permissionDefinition.deleteMany(),
    prisma.roleDefinition.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
    prisma.department.deleteMany(),
    prisma.company.deleteMany(),
    prisma.orgGroup.deleteMany(),
  ]);
  console.log("MySQL cleared");

  // ── 2. Migrate tables in FK-safe order ──────────────────────────────────

  // OrgGroup
  const orgGroups = await q("SELECT * FROM \"OrgGroup\"");
  for (const r of orgGroups) {
    await prisma.orgGroup.create({ data: r as any });
  }
  console.log(`OrgGroup: ${orgGroups.length}`);

  // Company
  const companies = await q("SELECT * FROM \"Company\"");
  for (const r of companies) {
    await prisma.company.create({ data: r as any });
  }
  console.log(`Company: ${companies.length}`);

  // Department
  const departments = await q("SELECT * FROM \"Department\"");
  for (const r of departments) {
    await prisma.department.create({ data: r as any });
  }
  console.log(`Department: ${departments.length}`);

  // User
  const users = await q("SELECT * FROM \"User\"");
  for (const r of users) {
    await prisma.user.create({ data: r as any });
  }
  console.log(`User: ${users.length}`);

  // Session
  const sessions = await q("SELECT * FROM \"Session\"");
  for (const r of sessions) {
    await prisma.session.create({ data: r as any });
  }
  console.log(`Session: ${sessions.length}`);

  // RoleDefinition
  const roles = await q("SELECT * FROM \"RoleDefinition\"");
  for (const r of roles) {
    await prisma.roleDefinition.create({ data: r as any });
  }
  console.log(`RoleDefinition: ${roles.length}`);

  // PermissionDefinition
  const perms = await q("SELECT * FROM \"PermissionDefinition\"");
  for (const r of perms) {
    await prisma.permissionDefinition.create({ data: r as any });
  }
  console.log(`PermissionDefinition: ${perms.length}`);

  // RolePermission
  const rolePerms = await q("SELECT * FROM \"RolePermission\"");
  for (const r of rolePerms) {
    await prisma.rolePermission.create({ data: r as any });
  }
  console.log(`RolePermission: ${rolePerms.length}`);

  // GroupMembership
  const groupMems = await q("SELECT * FROM \"GroupMembership\"");
  for (const r of groupMems) {
    await prisma.groupMembership.create({ data: r as any });
  }
  console.log(`GroupMembership: ${groupMems.length}`);

  // CompanyMembership
  const companyMems = await q("SELECT * FROM \"CompanyMembership\"");
  for (const r of companyMems) {
    await prisma.companyMembership.create({ data: r as any });
  }
  console.log(`CompanyMembership: ${companyMems.length}`);

  // ProjectGroup
  const projectGroups = await q("SELECT * FROM \"ProjectGroup\"");
  for (const r of projectGroups) {
    await prisma.projectGroup.create({ data: r as any });
  }
  console.log(`ProjectGroup: ${projectGroups.length}`);

  // Project
  const projects = await q("SELECT * FROM \"Project\"");
  for (const r of projects) {
    await prisma.project.create({ data: r as any });
  }
  console.log(`Project: ${projects.length}`);

  // ProjectMembership
  const projectMems = await q("SELECT * FROM \"ProjectMembership\"");
  for (const r of projectMems) {
    await prisma.projectMembership.create({ data: r as any });
  }
  console.log(`ProjectMembership: ${projectMems.length}`);

  // WorkflowLayer
  const wfLayers = await q("SELECT * FROM \"WorkflowLayer\"");
  for (const r of wfLayers) {
    await prisma.workflowLayer.create({ data: r as any });
  }
  console.log(`WorkflowLayer: ${wfLayers.length}`);

  // WorkflowNode — operationalLabels: array → JSON; topological sort for parentNodeId self-ref
  const wfNodes = await q("SELECT * FROM \"WorkflowNode\"");
  const nodeMap = new Map(wfNodes.map((n: any) => [n.id, n]));
  const inserted = new Set<string>();
  async function insertNode(n: any) {
    if (inserted.has(n.id)) return;
    if (n.parentNodeId && !inserted.has(n.parentNodeId)) {
      const parent = nodeMap.get(n.parentNodeId);
      if (parent) await insertNode(parent);
    }
    await prisma.workflowNode.create({
      data: { ...(n as any), operationalLabels: toJson((n as any).operationalLabels) },
    });
    inserted.add(n.id);
  }
  for (const n of wfNodes) await insertNode(n);
  console.log(`WorkflowNode: ${wfNodes.length}`);

  // WorkflowEdge
  const wfEdges = await q("SELECT * FROM \"WorkflowEdge\"");
  for (const r of wfEdges) {
    await prisma.workflowEdge.create({ data: r as any });
  }
  console.log(`WorkflowEdge: ${wfEdges.length}`);

  // WorkflowNodeAssignee
  const wfAssignees = await q("SELECT * FROM \"WorkflowNodeAssignee\"");
  for (const r of wfAssignees) {
    await prisma.workflowNodeAssignee.create({ data: r as any });
  }
  console.log(`WorkflowNodeAssignee: ${wfAssignees.length}`);

  // WorkflowNodeWaitingUser
  const wfWaiting = await q("SELECT * FROM \"WorkflowNodeWaitingUser\"");
  for (const r of wfWaiting) {
    await prisma.workflowNodeWaitingUser.create({ data: r as any });
  }
  console.log(`WorkflowNodeWaitingUser: ${wfWaiting.length}`);

  // ProjectRelation
  const projRelations = await q("SELECT * FROM \"ProjectRelation\"");
  for (const r of projRelations) {
    await prisma.projectRelation.create({ data: r as any });
  }
  console.log(`ProjectRelation: ${projRelations.length}`);

  // ProjectRelationSharedAttachment
  const prsa = await q("SELECT * FROM \"ProjectRelationSharedAttachment\"");
  for (const r of prsa) {
    await prisma.projectRelationSharedAttachment.create({ data: r as any });
  }
  console.log(`ProjectRelationSharedAttachment: ${prsa.length}`);

  // ProjectRelationSharedKnowledge
  const prsk = await q("SELECT * FROM \"ProjectRelationSharedKnowledge\"");
  for (const r of prsk) {
    await prisma.projectRelationSharedKnowledge.create({ data: r as any });
  }
  console.log(`ProjectRelationSharedKnowledge: ${prsk.length}`);

  // CompanionProfile
  const companions = await q("SELECT * FROM \"CompanionProfile\"");
  for (const r of companions) {
    await prisma.companionProfile.create({ data: r as any });
  }
  console.log(`CompanionProfile: ${companions.length}`);

  // CompanyOnboardingMaterial (must be before MemberOnboarding)
  const onboardMats = await q("SELECT * FROM \"CompanyOnboardingMaterial\"");
  for (const r of onboardMats) {
    await prisma.companyOnboardingMaterial.create({ data: r as any });
  }
  console.log(`CompanyOnboardingMaterial: ${onboardMats.length}`);

  // MemberOnboarding
  const onboardings = await q("SELECT * FROM \"MemberOnboarding\"");
  for (const r of onboardings) {
    await prisma.memberOnboarding.create({ data: r as any });
  }
  console.log(`MemberOnboarding: ${onboardings.length}`);

  // MemberOnboardingChecklistItem
  const checklistItems = await q("SELECT * FROM \"MemberOnboardingChecklistItem\"");
  for (const r of checklistItems) {
    await prisma.memberOnboardingChecklistItem.create({ data: r as any });
  }
  console.log(`MemberOnboardingChecklistItem: ${checklistItems.length}`);

  // CalendarLabel
  const calLabels = await q("SELECT * FROM \"CalendarLabel\"");
  for (const r of calLabels) {
    await prisma.calendarLabel.create({ data: r as any });
  }
  console.log(`CalendarLabel: ${calLabels.length}`);

  // CalendarEvent — externalAttendeeEmails: array → JSON
  const calEvents = await q("SELECT * FROM \"CalendarEvent\"");
  for (const r of calEvents) {
    await prisma.calendarEvent.create({
      data: { ...(r as any), externalAttendeeEmails: toJson((r as any).externalAttendeeEmails) },
    });
  }
  console.log(`CalendarEvent: ${calEvents.length}`);

  // CalendarAttendee
  const calAttendees = await q("SELECT * FROM \"CalendarAttendee\"");
  for (const r of calAttendees) {
    await prisma.calendarAttendee.create({ data: r as any });
  }
  console.log(`CalendarAttendee: ${calAttendees.length}`);

  // KnowledgeAsset
  const knowledge = await q("SELECT * FROM \"KnowledgeAsset\"");
  for (const r of knowledge) {
    await prisma.knowledgeAsset.create({ data: r as any });
  }
  console.log(`KnowledgeAsset: ${knowledge.length}`);

  // KnowledgeReuseEvent
  const knowledgeReuse = await q("SELECT * FROM \"KnowledgeReuseEvent\"");
  for (const r of knowledgeReuse) {
    await prisma.knowledgeReuseEvent.create({ data: r as any });
  }
  console.log(`KnowledgeReuseEvent: ${knowledgeReuse.length}`);

  // RecognitionEvent
  const recognitions = await q("SELECT * FROM \"RecognitionEvent\"");
  for (const r of recognitions) {
    await prisma.recognitionEvent.create({ data: r as any });
  }
  console.log(`RecognitionEvent: ${recognitions.length}`);

  // ScoreLedgerEntry
  const scores = await q("SELECT * FROM \"ScoreLedgerEntry\"");
  for (const r of scores) {
    await prisma.scoreLedgerEntry.create({ data: r as any });
  }
  console.log(`ScoreLedgerEntry: ${scores.length}`);

  // PerformanceSnapshot
  const perf = await q("SELECT * FROM \"PerformanceSnapshot\"");
  for (const r of perf) {
    await prisma.performanceSnapshot.create({ data: r as any });
  }
  console.log(`PerformanceSnapshot: ${perf.length}`);

  // Attachment
  const attachments = await q("SELECT * FROM \"Attachment\"");
  for (const r of attachments) {
    await prisma.attachment.create({ data: r as any });
  }
  console.log(`Attachment: ${attachments.length}`);

  // DirectMessagePreference
  const dmPrefs = await q("SELECT * FROM \"DirectMessagePreference\"");
  for (const r of dmPrefs) {
    await prisma.directMessagePreference.create({ data: r as any });
  }
  console.log(`DirectMessagePreference: ${dmPrefs.length}`);

  // DirectMessage
  const dms = await q("SELECT * FROM \"DirectMessage\"");
  for (const r of dms) {
    await prisma.directMessage.create({ data: r as any });
  }
  console.log(`DirectMessage: ${dms.length}`);

  // DirectMessageAttachment
  const dmAttachments = await q("SELECT * FROM \"DirectMessageAttachment\"");
  for (const r of dmAttachments) {
    await prisma.directMessageAttachment.create({ data: r as any });
  }
  console.log(`DirectMessageAttachment: ${dmAttachments.length}`);

  // MessageGroup
  const msgGroups = await q("SELECT * FROM \"MessageGroup\"");
  for (const r of msgGroups) {
    await prisma.messageGroup.create({ data: r as any });
  }
  console.log(`MessageGroup: ${msgGroups.length}`);

  // MessageGroupMember
  const msgGroupMembers = await q("SELECT * FROM \"MessageGroupMember\"");
  for (const r of msgGroupMembers) {
    await prisma.messageGroupMember.create({ data: r as any });
  }
  console.log(`MessageGroupMember: ${msgGroupMembers.length}`);

  // MessageGroupMessage
  const msgGroupMsgs = await q("SELECT * FROM \"MessageGroupMessage\"");
  for (const r of msgGroupMsgs) {
    await prisma.messageGroupMessage.create({ data: r as any });
  }
  console.log(`MessageGroupMessage: ${msgGroupMsgs.length}`);

  // MessageGroupMessageAttachment
  const msgGroupMsgAttachments = await q("SELECT * FROM \"MessageGroupMessageAttachment\"");
  for (const r of msgGroupMsgAttachments) {
    await prisma.messageGroupMessageAttachment.create({ data: r as any });
  }
  console.log(`MessageGroupMessageAttachment: ${msgGroupMsgAttachments.length}`);

  // InAppNotification
  const notifications = await q("SELECT * FROM \"InAppNotification\"");
  for (const r of notifications) {
    await prisma.inAppNotification.create({ data: r as any });
  }
  console.log(`InAppNotification: ${notifications.length}`);

  // AuditLogEntry
  const audits = await q("SELECT * FROM \"AuditLogEntry\"");
  for (const r of audits) {
    await prisma.auditLogEntry.create({ data: r as any });
  }
  console.log(`AuditLogEntry: ${audits.length}`);

  // FeedbackEvent
  const feedbacks = await q("SELECT * FROM \"FeedbackEvent\"");
  for (const r of feedbacks) {
    await prisma.feedbackEvent.create({ data: r as any });
  }
  console.log(`FeedbackEvent: ${feedbacks.length}`);

  // LifecycleTriggerRule
  const lcRules = await q("SELECT * FROM \"LifecycleTriggerRule\"");
  for (const r of lcRules) {
    await prisma.lifecycleTriggerRule.create({ data: r as any });
  }
  console.log(`LifecycleTriggerRule: ${lcRules.length}`);

  // LifecycleTriggerFire
  const lcFires = await q("SELECT * FROM \"LifecycleTriggerFire\"");
  for (const r of lcFires) {
    await prisma.lifecycleTriggerFire.create({ data: r as any });
  }
  console.log(`LifecycleTriggerFire: ${lcFires.length}`);

  // LifecycleReminderLog
  const lcLogs = await q("SELECT * FROM \"LifecycleReminderLog\"");
  for (const r of lcLogs) {
    await prisma.lifecycleReminderLog.create({ data: r as any });
  }
  console.log(`LifecycleReminderLog: ${lcLogs.length}`);

  // MemberOutput
  const memberOutputs = await q("SELECT * FROM \"MemberOutput\"");
  for (const r of memberOutputs) {
    await prisma.memberOutput.create({ data: r as any });
  }
  console.log(`MemberOutput: ${memberOutputs.length}`);

  // OffboardingRun
  const offboardRuns = await q("SELECT * FROM \"OffboardingRun\"");
  for (const r of offboardRuns) {
    await prisma.offboardingRun.create({ data: r as any });
  }
  console.log(`OffboardingRun: ${offboardRuns.length}`);

  // OffboardingChecklistItem
  const offboardItems = await q("SELECT * FROM \"OffboardingChecklistItem\"");
  for (const r of offboardItems) {
    await prisma.offboardingChecklistItem.create({ data: r as any });
  }
  console.log(`OffboardingChecklistItem: ${offboardItems.length}`);

  // StaffInvite
  const staffInvites = await q("SELECT * FROM \"StaffInvite\"");
  for (const r of staffInvites) {
    await prisma.staffInvite.create({ data: r as any });
  }
  console.log(`StaffInvite: ${staffInvites.length}`);

  await pg.end();
  await prisma.$disconnect();
  console.log("\n✅ Migration complete");
}

main().catch((e) => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});
