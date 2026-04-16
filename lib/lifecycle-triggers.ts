import { prisma } from "@/lib/prisma";
import { getUserIdsWithPermissionInCompanies } from "@/lib/permissions";
import { sendLifecycleEmail } from "@/lib/email";

async function hrInboxUserIds(subjectUserId: string): Promise<string[]> {
  const memberships = await prisma.companyMembership.findMany({
    where: { userId: subjectUserId },
    include: { company: true },
  });
  if (!memberships.length) return [];
  const companyIds = [...new Set(memberships.map((m) => m.companyId))];
  const orgIds = [...new Set(memberships.map((m) => m.company.orgGroupId))];

  const pipeline = await getUserIdsWithPermissionInCompanies("lifecycle.hr.pipeline", companyIds);
  const set = new Set<string>();
  for (const id of pipeline) set.add(id);

  const groupRows = await prisma.groupMembership.findMany({
    where: { orgGroupId: { in: orgIds }, roleDefinition: { key: "GROUP_ADMIN" } },
    select: { userId: true },
  });
  for (const r of groupRows) set.add(r.userId);

  if (!pipeline.length) {
    const companyAdminRows = await prisma.companyMembership.findMany({
      where: { companyId: { in: companyIds }, roleDefinition: { key: "COMPANY_ADMIN" } },
      select: { userId: true },
    });
    for (const r of companyAdminRows) set.add(r.userId);
  }

  set.delete(subjectUserId);
  return [...set];
}

async function sendHrTriggerEmails(subjectUserId: string, title: string, html: string) {
  const memberships = await prisma.companyMembership.findMany({
    where: { userId: subjectUserId },
    select: { companyId: true },
  });
  const companyIds = [...new Set(memberships.map((m) => m.companyId))];
  const ids = await hrInboxUserIds(subjectUserId);
  if (!ids.length) return;
  const emailOptIn = await getUserIdsWithPermissionInCompanies("lifecycle.email.send", companyIds);
  const recipientIds = emailOptIn.length ? ids.filter((id) => emailOptIn.includes(id)) : ids;
  if (!recipientIds.length) return;
  const users = await prisma.user.findMany({
    where: { id: { in: recipientIds }, deletedAt: null, active: true },
    select: { email: true },
  });
  const emails = users.map((u) => u.email).filter(Boolean);
  if (!emails.length) return;
  await sendLifecycleEmail(emails, title, html);
}

async function supervisorIdsForSubject(subjectUserId: string): Promise<string[]> {
  const rows = await prisma.companyMembership.findMany({
    where: { userId: subjectUserId, supervisorUserId: { not: null } },
    select: { supervisorUserId: true },
  });
  return [...new Set(rows.map((r) => r.supervisorUserId).filter(Boolean) as string[])];
}

async function feedbackQualifyingIds(
  rule: { threshold: number; categoryMode: string },
  subjectUserId: string,
  windowStart: Date,
): Promise<string[] | null> {
  if (rule.categoryMode === "PER_CATEGORY") {
    const all = await prisma.feedbackEvent.findMany({
      where: { toUserId: subjectUserId, createdAt: { gte: windowStart } },
      select: { id: true, category: true },
    });
    const byCat = new Map<string, string[]>();
    for (const e of all) {
      if (!byCat.has(e.category)) byCat.set(e.category, []);
      byCat.get(e.category)!.push(e.id);
    }
    for (const ids of byCat.values()) {
      if (ids.length >= rule.threshold) return ids;
    }
    return null;
  }
  const events = await prisma.feedbackEvent.findMany({
    where: { toUserId: subjectUserId, createdAt: { gte: windowStart } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (events.length < rule.threshold) return null;
  return events.map((e) => e.id);
}

async function recognitionQualifyingIds(
  rule: { threshold: number; categoryMode: string },
  subjectUserId: string,
  windowStart: Date,
): Promise<string[] | null> {
  if (rule.categoryMode === "PER_CATEGORY") {
    const all = await prisma.recognitionEvent.findMany({
      where: { toUserId: subjectUserId, createdAt: { gte: windowStart } },
      select: { id: true, tagCategory: true },
    });
    const byTag = new Map<string, string[]>();
    for (const e of all) {
      const k = e.tagCategory;
      if (!byTag.has(k)) byTag.set(k, []);
      byTag.get(k)!.push(e.id);
    }
    for (const ids of byTag.values()) {
      if (ids.length >= rule.threshold) return ids;
    }
    return null;
  }
  const events = await prisma.recognitionEvent.findMany({
    where: { toUserId: subjectUserId, createdAt: { gte: windowStart } },
    select: { id: true },
  });
  if (events.length < rule.threshold) return null;
  return events.map((e) => e.id);
}

/** Rolling-window improvement (feedback) threshold — alerts + optional email (Resend). */
export async function evaluateImprovementTriggersForUser(subjectUserId: string) {
  const rules = await prisma.lifecycleTriggerRule.findMany({
    where: { active: true, kind: "FEEDBACK" },
  });
  const memberships = await prisma.companyMembership.findMany({
    where: { userId: subjectUserId },
    select: { companyId: true },
  });
  const companySet = new Set(memberships.map((m) => m.companyId));

  for (const rule of rules) {
    if (rule.scope === "COMPANY") {
      if (!rule.companyId || !companySet.has(rule.companyId)) continue;
    }
    const windowStart = new Date(Date.now() - rule.windowDays * 86400000);
    const ids = await feedbackQualifyingIds(rule, subjectUserId, windowStart);
    if (!ids?.length) continue;

    const recent = await prisma.lifecycleTriggerFire.findFirst({
      where: {
        ruleId: rule.id,
        subjectUserId,
        triggeredAt: { gte: new Date(Date.now() - 6 * 3600000) },
      },
    });
    if (recent) continue;

    await prisma.$transaction(async (tx) => {
      const fire = await tx.lifecycleTriggerFire.create({
        data: {
          ruleId: rule.id,
          subjectUserId,
          windowStart,
          windowEnd: new Date(),
          sourceEventIds: JSON.stringify(ids),
        },
      });
      await tx.inAppNotification.create({
        data: {
          userId: subjectUserId,
          kind: "IMPROVEMENT_THRESHOLD",
          title: "Improvement threshold reached",
          body: "Please schedule a follow-up meeting with your supervisor or HR.",
          href: `/calendar?create=1&sourceKind=IMPROVEMENT_TRIGGER&sourceId=${fire.id}`,
        },
      });
      for (const sid of await supervisorIdsForSubject(subjectUserId)) {
        await tx.inAppNotification.create({
          data: {
            userId: sid,
            kind: "IMPROVEMENT_THRESHOLD_SUPERVISOR",
            title: "Schedule staff check-in",
            body: `Improvement threshold fired in ${rule.windowDays}d window. Please arrange a follow-up meeting.`,
            href: `/calendar?create=1&sourceKind=IMPROVEMENT_TRIGGER&sourceId=${fire.id}`,
          },
        });
      }
      for (const hid of await hrInboxUserIds(subjectUserId)) {
        await tx.inAppNotification.create({
          data: {
            userId: hid,
            kind: "IMPROVEMENT_THRESHOLD_HR",
            title: "HR follow-up meeting needed",
            body: `Improvement threshold fired for ${subjectUserId}. Please invite this staff member for a meeting.`,
            href: `/calendar?create=1&sourceKind=IMPROVEMENT_TRIGGER&sourceId=${fire.id}`,
          },
        });
      }
    });

    await sendHrTriggerEmails(
      subjectUserId,
      "Improvement threshold triggered",
      `<p>A rolling-window improvement rule fired for user <code>${subjectUserId}</code>.</p><p><a href="${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")}/staff/${subjectUserId}">Open profile</a></p>`,
    );
  }
}

/** Rolling-window recognition threshold — positive attention flag + alerts + optional email. */
export async function evaluateRecognitionTriggersForUser(subjectUserId: string) {
  const rules = await prisma.lifecycleTriggerRule.findMany({
    where: { active: true, kind: "RECOGNITION" },
  });
  const memberships = await prisma.companyMembership.findMany({
    where: { userId: subjectUserId },
    select: { companyId: true },
  });
  const companySet = new Set(memberships.map((m) => m.companyId));

  for (const rule of rules) {
    if (rule.scope === "COMPANY") {
      if (!rule.companyId || !companySet.has(rule.companyId)) continue;
    }
    const windowStart = new Date(Date.now() - rule.windowDays * 86400000);
    const ids = await recognitionQualifyingIds(rule, subjectUserId, windowStart);
    if (!ids?.length) continue;

    const recent = await prisma.lifecycleTriggerFire.findFirst({
      where: {
        ruleId: rule.id,
        subjectUserId,
        triggeredAt: { gte: new Date(Date.now() - 6 * 3600000) },
      },
    });
    if (recent) continue;

    await prisma.$transaction(async (tx) => {
      const fire = await tx.lifecycleTriggerFire.create({
        data: {
          ruleId: rule.id,
          subjectUserId,
          windowStart,
          windowEnd: new Date(),
          sourceEventIds: JSON.stringify(ids),
        },
      });
      const until = new Date();
      until.setUTCDate(until.getUTCDate() + 90);
      await tx.user.update({
        where: { id: subjectUserId },
        data: { positiveAttentionUntil: until },
      });
      await tx.inAppNotification.create({
        data: {
          userId: subjectUserId,
          kind: "RECOGNITION_THRESHOLD",
          title: "Recognition milestone",
          body: "Please schedule a recognition follow-up meeting with HR or leadership.",
          href: `/calendar?create=1&sourceKind=RECOGNITION_TRIGGER&sourceId=${fire.id}`,
        },
      });
      for (const hid of await hrInboxUserIds(subjectUserId)) {
        await tx.inAppNotification.create({
          data: {
            userId: hid,
            kind: "RECOGNITION_THRESHOLD_ADMIN",
            title: "Recognition follow-up meeting",
            body: `Recognition threshold fired for ${subjectUserId}. Please invite this staff member for a conversation.`,
            href: `/calendar?create=1&sourceKind=RECOGNITION_TRIGGER&sourceId=${fire.id}`,
          },
        });
      }
    });

    await sendHrTriggerEmails(
      subjectUserId,
      "Recognition threshold triggered",
      `<p>A rolling-window recognition rule fired for user <code>${subjectUserId}</code>.</p><p><a href="${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")}/staff/${subjectUserId}">Open profile</a></p>`,
    );
  }
}
