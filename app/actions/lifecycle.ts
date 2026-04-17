"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CalendarSourceKind, LifecycleTriggerKind, LifecycleTriggerScope, OffboardingStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { canViewProject, isGroupAdmin, isSuperAdmin, type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { AuditEntityType } from "@prisma/client";
import {
  ensureDefaultCalendarLabels,
  getDefaultCalendarLabelId,
  normalizeCalendarLabelColor,
} from "@/lib/calendar-labels";
import { getCurrentCompanyOnboardingMaterial } from "@/lib/company-onboarding-materials";
import { canManageCompanyMemberships } from "@/lib/scoped-role-access";
import { formatInTimeZone, normalizeTimeZone, parseDatetimeLocalInTimeZone } from "@/lib/timezone";

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

function parseAttendeeIdsFromForm(formData: FormData): string[] {
  const attendeeRaw = String(formData.get("attendeeIds") ?? "").trim();
  return attendeeRaw
    ? [...new Set(attendeeRaw.split(",").map((s) => s.trim()).filter(Boolean))]
    : [];
}

function includeProjectMembersFromForm(formData: FormData) {
  const raw = String(formData.get("includeProjectMembers") ?? "").trim();
  return raw === "on" || raw === "1" || raw === "true";
}

async function loadCalendarProjectForActor(actor: AccessUser, projectId: string | null) {
  if (!projectId) return null;
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: {
      company: true,
      memberships: { select: { userId: true } },
    },
  });
  if (!project || !canViewProject(actor, project)) throw new Error("Project not found");
  return project;
}

async function resolveCalendarLabelId(formData: FormData, fallbackKey: "meeting" | "project") {
  await ensureDefaultCalendarLabels();
  const raw = String(formData.get("labelId") ?? "").trim();
  if (raw) {
    const label = await prisma.calendarLabel.findUnique({ where: { id: raw }, select: { id: true } });
    if (label) return label.id;
  }
  return getDefaultCalendarLabelId(fallbackKey);
}

async function notifyCalendarInvitees(
  eventId: string,
  title: string,
  startsAt: Date,
  actorId: string,
  users: { id: string; timezone: string }[],
) {
  const notifyUsers = users.filter((user) => user.id !== actorId);
  if (!notifyUsers.length) return;
  await prisma.inAppNotification.createMany({
    data: notifyUsers.map((user) => ({
      userId: user.id,
      kind: "CALENDAR_EVENT_INVITE",
      title: "New calendar event",
      body: `${title} · ${formatInTimeZone(startsAt, {
        locale: "en",
        timeZone: user.timezone,
        dateStyle: "medium",
        timeStyle: "short",
      })}`,
      href: `/calendar?eventId=${eventId}`,
    })),
  });
}

export async function acknowledgeMemberOnboardingMaterialsAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  const onboardingId = must(formData, "onboardingId");
  const ob = await prisma.memberOnboarding.findFirst({
    where: { id: onboardingId, userId: user.id },
    include: {
      assignedMaterial: true,
      company: {
        include: {
          onboardingMaterials: {
            orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],
          },
        },
      },
    },
  });
  if (!ob) throw new Error("Forbidden");
  const fallbackMaterial = !ob.packageUrl.trim() ? getCurrentCompanyOnboardingMaterial(ob.company) : null;
  const packageUrl = ob.packageUrl.trim() || fallbackMaterial?.packageUrl?.trim() || "";
  if (!packageUrl) {
    redirect(`/onboarding/member?companyId=${ob.companyId}&onboardingErr=materials_unavailable`);
  }
  const videoUrl = ob.videoUrl?.trim() || ob.assignedMaterial?.videoUrl?.trim() || fallbackMaterial?.videoUrl?.trim() || ob.company.onboardingVideoUrl?.trim();
  if (videoUrl && !ob.videoCompletedAt) {
    redirect(`/onboarding/member?companyId=${ob.companyId}&onboardingErr=video`);
  }
  await prisma.memberOnboarding.update({
    where: { id: onboardingId },
    data: { materialsOpenedAt: new Date() },
  });
  revalidatePath("/onboarding/member");
}

const EMBED_COMPLETION_SECONDS = 45;
const VIDEO_COMPLETE_RATIO = 0.85;

/** Client-reported progress for onboarding video (HTML5 or embed dwell). */
export async function updateOnboardingVideoProgressAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  const onboardingId = must(formData, "onboardingId");
  const mode = String(formData.get("mode") ?? "html5");
  const watchedRaw = Number(formData.get("watchedSeconds") ?? "");
  const durationRaw = Number(formData.get("durationSeconds") ?? "");
  const dwellDeltaRaw = Number(formData.get("dwellDeltaSeconds") ?? "");

  const ob = await prisma.memberOnboarding.findFirst({
    where: { id: onboardingId, userId: user.id },
    include: { assignedMaterial: true, company: true },
  });
  if (!ob) throw new Error("Forbidden");
  const videoUrl = ob?.videoUrl?.trim() || ob?.assignedMaterial?.videoUrl?.trim() || ob?.company.onboardingVideoUrl?.trim();
  if (!videoUrl) throw new Error("Forbidden");

  if (ob.videoCompletedAt) {
    revalidatePath("/onboarding/member");
    return;
  }

  let nextProgress = ob.videoProgressSeconds;
  let completedAt: Date | null = null;

  if (mode === "html5") {
    const watched = Number.isFinite(watchedRaw) ? Math.max(0, Math.floor(watchedRaw)) : 0;
    const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : 0;
    nextProgress = Math.max(ob.videoProgressSeconds, watched);
    if (duration > 0 && watched / duration >= VIDEO_COMPLETE_RATIO) {
      completedAt = new Date();
    }
  } else if (mode === "dwell") {
    const dwell = Number.isFinite(dwellDeltaRaw) ? Math.min(120, Math.max(0, Math.floor(dwellDeltaRaw))) : 0;
    nextProgress = Math.min(24 * 3600, ob.videoProgressSeconds + dwell);
    if (nextProgress >= EMBED_COMPLETION_SECONDS) {
      completedAt = new Date();
    }
  }

  await prisma.memberOnboarding.update({
    where: { id: onboardingId },
    data: {
      videoProgressSeconds: nextProgress,
      ...(completedAt ? { videoCompletedAt: completedAt } : {}),
    },
  });
  revalidatePath("/onboarding/member");
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

  const togglingOn = !item.completedAt;
  if (togglingOn) {
    if (item.itemKey === "OB_READ_PACKAGE" && !item.onboarding.materialsOpenedAt) {
      redirect(`/onboarding/member?companyId=${item.onboarding.companyId}&onboardingErr=materials`);
    }
    const siblings = await prisma.memberOnboardingChecklistItem.findMany({
      where: { onboardingId: item.onboardingId },
      orderBy: { sortOrder: "asc" },
    });
    const order = ["OB_READ_PACKAGE", "OB_ACK_POLICIES", "OB_SUPERVISOR_MEET"];
    const idx = order.indexOf(item.itemKey);
    if (idx > 0) {
      const prevKey = order[idx - 1];
      const prev = siblings.find((s) => s.itemKey === prevKey);
      if (!prev?.completedAt) {
        redirect(`/onboarding/member?companyId=${item.onboarding.companyId}&onboardingErr=order`);
      }
    }
  }

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

export async function skipMemberOnboardingAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  if (!isSuperAdmin(actor)) throw new Error("Forbidden");

  const onboardingId = must(formData, "onboardingId");
  const ob = await prisma.memberOnboarding.findFirst({
    where: { id: onboardingId },
    include: {
      assignedMaterial: true,
      company: {
        include: {
          onboardingMaterials: {
            orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],
          },
        },
      },
    },
  });
  if (!ob) throw new Error("Not found");
  if (ob.userId === actor.id) throw new Error("Forbidden");

  const fallbackMaterial = !ob.packageUrl.trim() ? getCurrentCompanyOnboardingMaterial(ob.company) : null;
  const videoUrl =
    ob.videoUrl?.trim() ||
    ob.assignedMaterial?.videoUrl?.trim() ||
    fallbackMaterial?.videoUrl?.trim() ||
    ob.company.onboardingVideoUrl?.trim();
  const now = new Date();

  await prisma.$transaction([
    prisma.memberOnboardingChecklistItem.updateMany({
      where: { onboardingId, completedAt: null },
      data: { completedAt: now },
    }),
    prisma.memberOnboarding.update({
      where: { id: onboardingId },
      data: {
        materialsOpenedAt: ob.materialsOpenedAt ?? now,
        completedAt: ob.completedAt ?? now,
        ...(videoUrl
          ? {
              videoCompletedAt: ob.videoCompletedAt ?? now,
              videoProgressSeconds: Math.max(ob.videoProgressSeconds, EMBED_COMPLETION_SECONDS),
            }
          : {}),
      },
    }),
  ]);

  await writeAudit({
    actorId: actor.id,
    entityType: "MEMBER_ONBOARDING",
    entityId: ob.id,
    action: "SKIP",
    meta: JSON.stringify({ userId: ob.userId, companyId: ob.companyId, by: "superadmin" }),
  });

  revalidatePath(`/staff/${ob.userId}`);
  revalidatePath("/staff");
  revalidatePath("/onboarding");
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
  const actorTimeZone = normalizeTimeZone(actor.timezone);
  const startsAt = parseDatetimeLocalInTimeZone(must(formData, "startsAt"), actorTimeZone);
  const endsAt = parseDatetimeLocalInTimeZone(must(formData, "endsAt"), actorTimeZone);
  if (!startsAt || !endsAt) throw new Error("Invalid time");
  if (!(startsAt.getTime() < endsAt.getTime())) throw new Error("Invalid time range");

  const meetUrl = String(formData.get("meetUrl") ?? "").trim() || null;
  const projectId = String(formData.get("projectId") ?? "").trim() || null;
  const project = await loadCalendarProjectForActor(actor, projectId);
  const labelId = await resolveCalendarLabelId(formData, projectId ? "project" : "meeting");
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
  const selectedAttendeeIds = parseAttendeeIdsFromForm(formData);
  const projectMemberIds =
    project && includeProjectMembersFromForm(formData)
      ? [project.ownerId, ...project.memberships.map((m) => m.userId)]
      : [];
  const attendeeIds = [...new Set([...selectedAttendeeIds, ...projectMemberIds])].filter((id) => id !== actor.id);
  const externalAttendeeEmails = parseExternalEmailsFromForm(formData);

  const description = String(formData.get("description") ?? "").trim() || null;

  const ev = await prisma.calendarEvent.create({
    data: {
      title,
      description,
      startsAt,
      endsAt,
      timezone: actorTimeZone,
      organizerUserId: actor.id,
      projectId: projectId || null,
      labelId,
      meetUrl,
      sourceKind,
      sourceId,
      externalAttendeeEmails,
    },
  });

  const attendeeUsers =
    attendeeIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: attendeeIds }, deletedAt: null, active: true },
          select: { id: true, timezone: true },
        })
      : [];
  if (attendeeUsers.length) {
    await prisma.calendarAttendee.createMany({
      data: attendeeUsers.map((u) => ({ eventId: ev.id, userId: u.id })),
      skipDuplicates: true,
    });
    await notifyCalendarInvitees(ev.id, title, startsAt, actor.id, attendeeUsers);
  }

  await writeAudit({
    actorId: actor.id,
    entityType: AuditEntityType.CALENDAR_EVENT,
    entityId: ev.id,
    action: "CREATE",
    newValue: title,
  });
  revalidatePath("/calendar");
  if (projectId) revalidatePath(`/projects/${projectId}`);
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
    include: { attendees: { select: { userId: true } } },
  });
  if (!existing || existing.organizerUserId !== actor.id) throw new Error("Forbidden");

  const title = must(formData, "title");
  const actorTimeZone = normalizeTimeZone(actor.timezone);
  const startsAt = parseDatetimeLocalInTimeZone(must(formData, "startsAt"), actorTimeZone);
  const endsAt = parseDatetimeLocalInTimeZone(must(formData, "endsAt"), actorTimeZone);
  if (!startsAt || !endsAt) throw new Error("Invalid time");
  if (!(startsAt.getTime() < endsAt.getTime())) throw new Error("Invalid time range");
  const description = String(formData.get("description") ?? "").trim() || null;
  const meetUrl = String(formData.get("meetUrl") ?? "").trim() || null;
  const projectIdRaw = String(formData.get("projectId") ?? "").trim() || null;
  const project = await loadCalendarProjectForActor(actor, projectIdRaw);
  const labelId = await resolveCalendarLabelId(formData, projectIdRaw ? "project" : "meeting");
  const selectedAttendeeIds = parseAttendeeIdsFromForm(formData);
  const projectMemberIds =
    project && includeProjectMembersFromForm(formData)
      ? [project.ownerId, ...project.memberships.map((m) => m.userId)]
      : [];
  const attendeeIds = [...new Set([...selectedAttendeeIds, ...projectMemberIds])].filter((userId) => userId !== actor.id);
  const externalAttendeeEmails = parseExternalEmailsFromForm(formData);

  const oldProjectId = existing.projectId;

  await prisma.calendarEvent.update({
    where: { id },
    data: {
      title,
      description,
      startsAt,
      endsAt,
      timezone: actorTimeZone,
      meetUrl,
      projectId: projectIdRaw,
      labelId,
      externalAttendeeEmails,
    },
  });

  const attendeeUsers =
    attendeeIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: attendeeIds }, deletedAt: null, active: true },
          select: { id: true, timezone: true },
        })
      : [];
  const validAttendeeIds = attendeeUsers.map((u) => u.id);
  const oldAttendeeIds = new Set(existing.attendees.map((a) => a.userId));
  await prisma.calendarAttendee.deleteMany({ where: { eventId: id } });
  if (validAttendeeIds.length) {
    await prisma.calendarAttendee.createMany({
      data: validAttendeeIds.map((userId) => ({ eventId: id, userId })),
      skipDuplicates: true,
    });
    await notifyCalendarInvitees(
      id,
      title,
      startsAt,
      actor.id,
      attendeeUsers.filter((user) => !oldAttendeeIds.has(user.id)),
    );
  }

  await writeAudit({
    actorId: actor.id,
    entityType: AuditEntityType.CALENDAR_EVENT,
    entityId: id,
    action: "UPDATE",
    newValue: title,
  });
  revalidatePath("/calendar");
  if (oldProjectId) revalidatePath(`/projects/${oldProjectId}`);
  if (projectIdRaw && projectIdRaw !== oldProjectId) revalidatePath(`/projects/${projectIdRaw}`);
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
  if (existing.projectId) revalidatePath(`/projects/${existing.projectId}`);
}

export async function createCalendarLabelAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "project.read");
  const name = must(formData, "name");
  const color = normalizeCalendarLabelColor(formData.get("color"));
  const maxSort = await prisma.calendarLabel.aggregate({ _max: { sortOrder: true } });
  await prisma.calendarLabel.create({
    data: {
      name,
      color,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
    },
  });
  revalidatePath("/calendar");
}

export async function updateCalendarLabelAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "project.read");
  const id = must(formData, "labelId");
  const name = must(formData, "name");
  const color = normalizeCalendarLabelColor(formData.get("color"));
  await prisma.calendarLabel.update({
    where: { id },
    data: { name, color },
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
  const userId = must(formData, "userId");
  const companyId = must(formData, "companyId");

  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) throw new Error("Company not found");
  if (!(await canManageCompanyMemberships(actor, company))) throw new Error("Forbidden");
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
  const itemId = must(formData, "itemId");
  const item = await prisma.offboardingChecklistItem.findFirst({
    where: { id: itemId },
    include: { run: { include: { company: true } } },
  });
  if (!item) throw new Error("Not found");
  const c = item.run.company;
  if (!(await canManageCompanyMemberships(actor, c))) throw new Error("Forbidden");
  await prisma.offboardingChecklistItem.update({
    where: { id: itemId },
    data: { completedAt: item.completedAt ? null : new Date() },
  });
  revalidatePath(`/staff/${item.run.userId}`);
}

export async function completeOffboardingRunAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  const runId = must(formData, "runId");
  const run = await prisma.offboardingRun.findFirst({
    where: { id: runId },
    include: { checklist: true, company: true },
  });
  if (!run) throw new Error("Not found");
  if (!(await canManageCompanyMemberships(actor, run.company))) throw new Error("Forbidden");
  const pending = run.checklist.some((c) => !c.completedAt);
  if (pending) throw new Error("Checklist incomplete");

  await prisma.offboardingRun.update({
    where: { id: runId },
    data: { status: OffboardingStatus.COMPLETED, completedAt: new Date() },
  });
  revalidatePath(`/staff/${run.userId}`);
}
