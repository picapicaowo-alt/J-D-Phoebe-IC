import { prisma } from "@/lib/prisma";
import {
  DEFAULT_COMPANY_ONBOARDING_DEADLINE_DAYS,
  DEFAULT_COMPANY_ONBOARDING_VERSION,
  getCurrentCompanyOnboardingMaterial,
} from "@/lib/company-onboarding-materials";

const DEFAULT_ITEM_KEYS = ["OB_READ_PACKAGE", "OB_ACK_POLICIES", "OB_SUPERVISOR_MEET"] as const;

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

/** Create an onboarding run for every member/company pair, even before HR uploads materials. */
export async function ensureMemberOnboardingForCompany(
  userId: string,
  companyId: string,
  opts?: { createPlaceholder?: boolean },
) {
  const createPlaceholder = opts?.createPlaceholder ?? false;
  const company = await prisma.company.findFirst({
    where: { id: companyId, deletedAt: null },
    include: {
      onboardingMaterials: {
        orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],
      },
    },
  });
  if (!company) return null;

  const membership = await prisma.companyMembership.findUnique({
    where: { userId_companyId: { userId, companyId } },
    include: { supervisor: true },
  });
  if (!membership) return null;

  const material = getCurrentCompanyOnboardingMaterial(company);
  const existing = await prisma.memberOnboarding.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });
  if (existing) {
    const existingPackageUrl = existing.packageUrl.trim();
    if (!existingPackageUrl && material) {
      return prisma.memberOnboarding.update({
        where: { id: existing.id },
        data: {
          companyOnboardingMaterialId: material.source === "db" ? material.id : null,
          packageUrl: material.packageUrl.trim(),
          videoUrl: material.videoUrl?.trim() || null,
          packageVersion: material.packageVersion ?? DEFAULT_COMPANY_ONBOARDING_VERSION,
          deadlineAt: addDays(new Date(), material.deadlineDays),
        },
      });
    }
    return existing;
  }
  if (!material && !createPlaceholder) return null;

  const deadlineAt = addDays(new Date(), material?.deadlineDays ?? DEFAULT_COMPANY_ONBOARDING_DEADLINE_DAYS);
  const liaison = membership.supervisor;

  const ob = await prisma.memberOnboarding.create({
    data: {
      userId,
      companyId,
      companyOnboardingMaterialId: material?.source === "db" ? material.id : null,
      packageUrl: material?.packageUrl?.trim() || "",
      videoUrl: material?.videoUrl?.trim() || null,
      packageVersion: material?.packageVersion ?? DEFAULT_COMPANY_ONBOARDING_VERSION,
      deadlineAt,
      liaisonUserId: liaison?.id ?? null,
      liaisonName: liaison?.name ?? null,
      liaisonEmail: liaison?.email ?? null,
      checklistItems: {
        create: DEFAULT_ITEM_KEYS.map((itemKey, i) => ({ itemKey, sortOrder: i })),
      },
    },
  });
  return ob;
}

export async function ensureAllMemberOnboardingsForUser(userId: string) {
  const memberships = await prisma.companyMembership.findMany({ where: { userId }, select: { companyId: true } });
  await Promise.all(memberships.map((m) => ensureMemberOnboardingForCompany(userId, m.companyId)));
}

export async function backfillMemberOnboardingsForCompany(companyId: string) {
  const memberships = await prisma.companyMembership.findMany({ where: { companyId }, select: { userId: true } });
  await Promise.all(memberships.map((m) => ensureMemberOnboardingForCompany(m.userId, companyId)));
}

/** Send one-time overdue reminders (member + supervisor). */
export async function refreshOnboardingOverdueReminders(userId: string) {
  const now = new Date();
  const open = await prisma.memberOnboarding.findMany({
    where: { userId, completedAt: null, deadlineAt: { lt: now } },
    include: { company: true, liaison: true },
  });
  for (const ob of open) {
    if (!ob.overdueSelfNotifiedAt) {
      await prisma.inAppNotification.create({
        data: {
          userId,
          kind: "ONBOARDING_OVERDUE_SELF",
          title: "Complete your onboarding checklist",
          body: ob.company.name,
          href: `/onboarding/member?companyId=${ob.companyId}`,
        },
      });
      await prisma.lifecycleReminderLog.create({
        data: {
          kind: "ONBOARDING_OVERDUE_SELF",
          recipientUserId: userId,
          relatedType: "MemberOnboarding",
          relatedId: ob.id,
          payload: { companyId: ob.companyId },
        },
      });
      await prisma.memberOnboarding.update({
        where: { id: ob.id },
        data: { overdueSelfNotifiedAt: now },
      });
    }
    if (ob.liaisonUserId && !ob.overdueSupervisorNotifiedAt) {
      await prisma.inAppNotification.create({
        data: {
          userId: ob.liaisonUserId,
          kind: "ONBOARDING_OVERDUE_SUPERVISOR",
          title: "A team member’s onboarding is overdue",
          body: `${ob.company.name} · member id ${userId}`,
          href: `/staff/${userId}`,
        },
      });
      await prisma.lifecycleReminderLog.create({
        data: {
          kind: "ONBOARDING_OVERDUE_SUPERVISOR",
          recipientUserId: ob.liaisonUserId,
          relatedType: "MemberOnboarding",
          relatedId: ob.id,
          payload: { subjectUserId: userId, companyId: ob.companyId },
        },
      });
      await prisma.memberOnboarding.update({
        where: { id: ob.id },
        data: { overdueSupervisorNotifiedAt: now },
      });
    }
  }
}
