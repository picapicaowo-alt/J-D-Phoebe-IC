"use server";

import { revalidatePath } from "next/cache";
import { CalendarSourceKind, LifecycleTriggerKind, LifecycleTriggerScope, OffboardingStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { isGroupAdmin, isSuperAdmin, type AccessUser } from "@/lib/access";
import { assertPermission, userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { AuditEntityType } from "@prisma/client";

function must(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function parseExternalEmailsFromForm(formData: FormData): string[] {
  const raw = String(formData.get("externalEmails") ?? "").trim();
  if (!raw) return [];
  const parts = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  return [...new Set(parts.filter((e) => EMAIL_RE.test(e)))];
}

export async function toggleMemberOnboardingChecklistAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  const itemId = must(formData, "itemId");
  const item = await prisma.memberOnboardingChecklistItem.findFirst({
    where: { id: itemId },
    include: { onboarding: true },
  });
  if (!item || item.onboarding.userId !== user.id) throw new Error("Forbidden");
  if (item.onboarding.completedAt) throw new Error("Already completed");

  await prisma.memberOnboardingChecklistItem.update({
    where: { id: itemId },
    data: { completedAt: item.completedAt ? null : new Date() },
  });
  const siblings = await prisma.memberOnboardingChecklistItem.findMany({
    where: { onboardingId: item.onboardingId },
  });
  const allDone = siblings.length > 0 && siblings.every((i) => i.completedAt);
  await prisma.memberOnboarding.update({
    where: { id: item.onboardingId },
    data: { completedAt: allDone ? new Date() : null },
  });
  revalidatePath("/onboarding/member");
  revalidatePath("/home");
}

export async function markNotificationReadAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  const id = must(formData, "notificationId");
  await prisma.inAppNotification.updateMany({
    where: { id, userId: user.id },
    data: { readAt: new Date() },
  });
  revalidatePath("/me/notifications");
  revalidatePath("/home");
}

export async function createLifecycleTriggerRuleAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  if (!isSuperAdmin(actor) && !actor.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN")) {
    throw new Error("Forbidden");
  }
  const kind = must(formData, "kind") as LifecycleTriggerKind;
  const windowDays = Math.max(1, Math.min(366, Number(formData.get("windowDays") ?? 30) || 30));
  const threshold = Math.max(1, Math.min(100, Number(formData.get("threshold") ?? 3) || 3));
  const scope = must(formData, "scope") as LifecycleTriggerScope;
  const companyIdRaw = String(formData.get("companyId") ?? "").trim();
  const companyId = scope === "COMPANY" ? companyIdRaw || null : null;
  if (scope === "COMPANY" && !companyId) throw new Error("Company required for company scope");

  const categoryModeRaw = String(formData.get("categoryMode") ?? "TOTAL_COUNT").trim();
  const categoryMode =
    categoryModeRaw === "PER_CATEGORY"
      ? "PER_CATEGORY"
      : categoryModeRaw === "ANY_CATEGORY"
        ? "ANY_CATEGORY"
        : "TOTAL_COUNT";

  if (companyId) {
    const c = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
    if (!c) throw new Error("Company not found");
    if (!isSuperAdmin(actor) && !isGroupAdmin(actor, c.orgGroupId)) throw new Error("Forbidden");
  }

  await prisma.lifecycleTriggerRule.create({
    data: {
      kind,
      windowDays,
      threshold,
      scope,
      companyId,
      categoryMode,
      active: true,
    },
  });
  revalidatePath("/settings/lifecycle");
}

export async function deleteLifecycleTriggerRuleAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  if (!isSuperAdmin(actor) && !actor.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN")) {
    throw new Error("Forbidden");
  }
  const id = must(formData, "ruleId");
  const rule = await prisma.lifecycleTriggerRule.findFirst({ where: { id }, include: { company: true } });
  if (!rule) throw new Error("Not found");
  if (rule.companyId && rule.company) {
    if (!isSuperAdmin(actor) && !isGroupAdmin(actor, rule.company.orgGroupId)) throw new Error("Forbidden");
  }
  await prisma.lifecycleTriggerRule.delete({ where: { id } });
  revalidatePath("/settings/lifecycle");
}

export async function createCalendarEventAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "project.read");

  const title = must(formData, "title");
  const startsAt = new Date(must(formData, "startsAt"));
  const endsAt = new Date(must(formData, "endsAt"));
  if (!(startsAt.getTime() < endsAt.getTime())) throw new Error("Invalid time range");

  const meetUrl = String(formData.get("meetUrl") ?? "").trim() || null;
  const projectId = String(formData.get("projectId") ?? "").trim() || null;
  const rawKind = String(formData.get("sourceKind") ?? "MANUAL").trim() || "MANUAL";
  const allowedKinds: CalendarSourceKind[] = [
    "MANUAL",
    "ONBOARDING",
    "IMPROVEMENT_TRIGGER",
    "RECOGNITION_TRIGGER",
    "OFFBOARDING",
  ];
  const sourceKind = (allowedKinds.includes(rawKind as CalendarSourceKind) ? rawKind : "MANUAL") as CalendarSourceKind;
  const sourceId = String(formData.get("sourceId") ?? "").trim() || null;
  const attendeeRaw = String(formData.get("attendeeIds") ?? "").trim();
  const attendeeIds = attendeeRaw
    ? [...new Set(attendeeRaw.split(",").map((s) => s.trim()).filter(Boolean))]
    : [];
  const externalAttendeeEmails = parseExternalEmailsFromForm(formData);

  if (projectId) {
    const p = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
    if (!p) throw new Error("Project not found");
  }

  const description = String(formData.get("description") ?? "").trim() || null;

  const ev = await prisma.calendarEvent.create({
    data: {
      title,
      description,
      startsAt,
      endsAt,
      organizerUserId: actor.id,
      projectId: projectId || null,
      meetUrl,
      sourceKind,
      sourceId,
      externalAttendeeEmails,
    },
  });

  const attendeeUsers =
    attendeeIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: attendeeIds }, deletedAt: null },
          select: { id: true, email: true },
        })
      : [];
  const googleAttendeeEmails = [
    ...new Set(
      [
        ...attendeeUsers.map((u) => u.email.trim()).filter(Boolean),
        ...externalAttendeeEmails,
      ].filter((e) => EMAIL_RE.test(e)),
    ),
  ];

  let externalCalendarEventId: string | null = null;
  if (await userHasPermission(actor, "lifecycle.calendar.google")) {
    const cred = await prisma.googleCalendarCredential.findUnique({ where: { userId: actor.id } });
    if (cred) {
      try {
        const { insertAppEventToGoogleCalendar } = await import("@/lib/google-calendar-sync");
        externalCalendarEventId = await insertAppEventToGoogleCalendar({
          userId: actor.id,
          title,
          description,
          startsAt,
          endsAt,
          meetUrl,
          attendeeEmails: googleAttendeeEmails.length ? googleAttendeeEmails : undefined,
        });
      } catch (e) {
        console.error("Google Calendar sync failed", e);
      }
    }
  }
  if (externalCalendarEventId) {
    await prisma.calendarEvent.update({
      where: { id: ev.id },
      data: { externalCalendarEventId },
    });
  }

  if (attendeeUsers.length) {
    await prisma.calendarAttendee.createMany({
      data: attendeeUsers.map((u) => ({ eventId: ev.id, userId: u.id })),
      skipDuplicates: true,
    });
    const notifyIds = attendeeUsers.map((u) => u.id).filter((id) => id !== actor.id);
    if (notifyIds.length) {
      const when = `${startsAt.toISOString().slice(0, 16).replace("T", " ")} (UTC)`;
      await prisma.inAppNotification.createMany({
        data: notifyIds.map((userId) => ({
          userId,
          kind: "CALENDAR_EVENT_INVITE",
          title: "New calendar event",
          body: `${title} · ${when}`,
          href: `/calendar?eventId=${ev.id}`,
        })),
      });
    }
  }

  await writeAudit({
    actorId: actor.id,
    entityType: AuditEntityType.CALENDAR_EVENT,
    entityId: ev.id,
    action: "CREATE",
    newValue: title,
  });
  revalidatePath("/calendar");
}

export async function updateCalendarEventAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "project.read");
  const id = must(formData, "eventId");
  const existing = await prisma.calendarEvent.findFirst({
    where: {
      id,
      OR: [{ organizerUserId: actor.id }, { attendees: { some: { userId: actor.id } } }],
    },
  });
  if (!existing || existing.organizerUserId !== actor.id) throw new Error("Forbidden");

  const title = must(formData, "title");
  const startsAt = new Date(must(formData, "startsAt"));
  const endsAt = new Date(must(formData, "endsAt"));
  if (!(startsAt.getTime() < endsAt.getTime())) throw new Error("Invalid time range");
  const description = String(formData.get("description") ?? "").trim() || null;
  const meetUrl = String(formData.get("meetUrl") ?? "").trim() || null;
  const projectIdRaw = String(formData.get("projectId") ?? "").trim() || null;
  if (projectIdRaw) {
    const p = await prisma.project.findFirst({ where: { id: projectIdRaw, deletedAt: null } });
    if (!p) throw new Error("Project not found");
  }

  await prisma.calendarEvent.update({
    where: { id },
    data: {
      title,
      description,
      startsAt,
      endsAt,
      meetUrl,
      projectId: projectIdRaw,
    },
  });
  await writeAudit({
    actorId: actor.id,
    entityType: AuditEntityType.CALENDAR_EVENT,
    entityId: id,
    action: "UPDATE",
    newValue: title,
  });
  revalidatePath("/calendar");
}

export async function deleteCalendarEventAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "project.read");
  const id = must(formData, "eventId");
  const existing = await prisma.calendarEvent.findFirst({ where: { id } });
  if (!existing || existing.organizerUserId !== actor.id) throw new Error("Forbidden");
  await prisma.calendarAttendee.deleteMany({ where: { eventId: id } });
  await prisma.calendarEvent.delete({ where: { id } });
  await writeAudit({
    actorId: actor.id,
    entityType: AuditEntityType.CALENDAR_EVENT,
    entityId: id,
    action: "DELETE",
    newValue: existing.title,
  });
  revalidatePath("/calendar");
}

const OFFBOARDING_KEYS = [
  { key: "OFF_TASK_HANDOFF", en: "Task handoff confirmed", zh: "任务交接已确认" },
  { key: "OFF_ACCESS", en: "Access / permissions reviewed", zh: "权限与访问已回收或调整" },
  { key: "OFF_OWNER", en: "Project ownership updated", zh: "项目负责人已更新或补位" },
] as const;

export async function startOffboardingRunAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "staff.assign_company");
  const userId = must(formData, "userId");
  const companyId = must(formData, "companyId");

  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) throw new Error("Company not found");
  if (!isSuperAdmin(actor) && !isGroupAdmin(actor, company.orgGroupId) && !actor.companyMemberships.some((m) => m.companyId === companyId && m.roleDefinition.key === "COMPANY_ADMIN")) {
    throw new Error("Forbidden");
  }
  const targetMember = await prisma.companyMembership.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });
  if (!targetMember) throw new Error("User is not in this company");

  const run = await prisma.offboardingRun.create({
    data: {
      userId,
      companyId,
      status: OffboardingStatus.IN_PROGRESS,
      startedById: actor.id,
      checklist: {
        create: OFFBOARDING_KEYS.map((k) => ({
          itemKey: k.key,
          label: k.en,
        })),
      },
    },
  });
  await writeAudit({
    actorId: actor.id,
    entityType: AuditEntityType.OFFBOARDING_RUN,
    entityId: run.id,
    action: "CREATE",
    meta: JSON.stringify({ userId, companyId }),
  });
  revalidatePath(`/staff/${userId}`);
}

export async function toggleOffboardingChecklistAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "staff.assign_company");
  const itemId = must(formData, "itemId");
  const item = await prisma.offboardingChecklistItem.findFirst({
    where: { id: itemId },
    include: { run: { include: { company: true } } },
  });
  if (!item) throw new Error("Not found");
  const c = item.run.company;
  if (!isSuperAdmin(actor) && !isGroupAdmin(actor, c.orgGroupId) && !actor.companyMemberships.some((m) => m.companyId === c.id && m.roleDefinition.key === "COMPANY_ADMIN")) {
    throw new Error("Forbidden");
  }
  await prisma.offboardingChecklistItem.update({
    where: { id: itemId },
    data: { completedAt: item.completedAt ? null : new Date() },
  });
  revalidatePath(`/staff/${item.run.userId}`);
}

export async function completeOffboardingRunAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "staff.assign_company");
  const runId = must(formData, "runId");
  const run = await prisma.offboardingRun.findFirst({
    where: { id: runId },
    include: { checklist: true, company: true },
  });
  if (!run) throw new Error("Not found");
  if (!isSuperAdmin(actor) && !isGroupAdmin(actor, run.company.orgGroupId) && !actor.companyMemberships.some((m) => m.companyId === run.companyId && m.roleDefinition.key === "COMPANY_ADMIN")) {
    throw new Error("Forbidden");
  }
  const pending = run.checklist.some((c) => !c.completedAt);
  if (pending) throw new Error("Checklist incomplete");

  await prisma.offboardingRun.update({
    where: { id: runId },
    data: { status: OffboardingStatus.COMPLETED, completedAt: new Date() },
  });
  revalidatePath(`/staff/${run.userId}`);
}
