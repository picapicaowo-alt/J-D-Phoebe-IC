import { hash } from "bcryptjs";
import {
  CompanionSpecies,
  CompanyStatus,
  KnowledgeLayer,
  ProjectRelationType,
  OrgGroupStatus,
  Priority,
  ProjectStatus,
  RecognitionMode,
  RecognitionTagCategory,
  WorkflowEdgeKind,
  WorkflowNodeStatus,
  WorkflowNodeType,
} from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { PERMISSION_KEYS } from "../lib/permission-keys";

const prisma = new PrismaClient();

const ALL_PERMS = [...PERMISSION_KEYS];

const COMPANY_ADMIN_PERMS = ALL_PERMS.filter(
  (k) =>
    ![
      "org.group.update",
      "permission.matrix.update",
      "trash.purge",
      "staff.purge",
      "staff.soft_delete",
      "staff.restore",
      "company.purge",
      "project.purge",
    ].includes(k),
);

const PROJECT_MANAGER_PERMS = [
  "org.group.read",
  "company.read",
  "project.create",
  "project.read",
  "project.update",
  "project.archive",
  "project.restore",
  "project.workflow.read",
  "project.workflow.update",
  "project.map.update",
  "project.member.manage",
  "recognition.read",
  "recognition.create",
  "feedback.submit",
  "leaderboard.read",
  "knowledge.read",
  "knowledge.create",
  "staff.read",
  "staff.assign_project",
  "trash.read",
  "trash.restore",
  "lifecycle.onboarding.hub",
];

const COMPANY_CONTRIBUTOR_PERMS = [
  "org.group.read",
  "company.read",
  "project.read",
  "project.workflow.read",
  "recognition.read",
  "recognition.create",
  "leaderboard.read",
  "knowledge.read",
  "knowledge.create",
  "staff.read",
  "lifecycle.onboarding.hub",
];

const PROJECT_CONTRIBUTOR_PERMS = [
  "org.group.read",
  "company.read",
  "project.read",
  "project.workflow.read",
  "project.workflow.update",
  "recognition.read",
  "leaderboard.read",
  "knowledge.read",
  "knowledge.create",
  "staff.read",
  "lifecycle.onboarding.hub",
];

async function main() {
  await prisma.staffInvite.deleteMany();
  await prisma.calendarAttendee.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.calendarLabel.deleteMany();
  await prisma.offboardingChecklistItem.deleteMany();
  await prisma.offboardingRun.deleteMany();
  await prisma.inAppNotification.deleteMany();
  await prisma.lifecycleReminderLog.deleteMany();
  await prisma.lifecycleTriggerFire.deleteMany();
  await prisma.lifecycleTriggerRule.deleteMany();
  await prisma.memberOnboardingChecklistItem.deleteMany();
  await prisma.memberOnboarding.deleteMany();
  await prisma.auditLogEntry.deleteMany();
  await prisma.scoreLedgerEntry.deleteMany();
  await prisma.feedbackEvent.deleteMany();
  await prisma.knowledgeReuseEvent.deleteMany();
  await prisma.projectRelation.deleteMany();
  await prisma.knowledgeAsset.deleteMany();
  await prisma.recognitionEvent.deleteMany();
  await prisma.performanceSnapshot.deleteMany();
  await prisma.companionProfile.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.memberOutput.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.permissionDefinition.deleteMany();
  await prisma.workflowEdge.deleteMany();
  await prisma.workflowNodeAssignee.deleteMany();
  await prisma.workflowNode.deleteMany();
  await prisma.workflowLayer.deleteMany();
  await prisma.projectMembership.deleteMany();
  await prisma.project.deleteMany();
  await prisma.companyMembership.deleteMany();
  await prisma.company.deleteMany();
  await prisma.groupMembership.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.roleDefinition.deleteMany();
  await prisma.orgGroup.deleteMany();

  await prisma.calendarLabel.createMany({
    data: [
      { key: "meeting", name: "Meeting", color: "#6366f1", sortOrder: 0, isDefault: true },
      { key: "project", name: "Project", color: "#0f766e", sortOrder: 1, isDefault: true },
      { key: "deadline", name: "Deadline", color: "#f97316", sortOrder: 2, isDefault: true },
    ],
  });

  for (const key of PERMISSION_KEYS) {
    await prisma.permissionDefinition.create({
      data: {
        key,
        description: key.replaceAll(".", " "),
        category: key.split(".")[0] ?? "misc",
      },
    });
  }

  const roles = await prisma.$transaction([
    prisma.roleDefinition.create({
      data: {
        key: "GROUP_ADMIN",
        displayName: "Group Admin",
        description: "Manage the parent group, companies, and group-level staff visibility.",
        appliesScope: "GROUP",
        system: true,
      },
    }),
    prisma.roleDefinition.create({
      data: {
        key: "COMPANY_ADMIN",
        displayName: "Company Admin",
        description: "Full management for one company entity and its projects.",
        appliesScope: "COMPANY",
        system: true,
      },
    }),
    prisma.roleDefinition.create({
      data: {
        key: "PROJECT_MANAGER",
        displayName: "Project Manager",
        description: "Own delivery for a project: members, workflow, and reporting.",
        appliesScope: "PROJECT",
        system: true,
      },
    }),
    prisma.roleDefinition.create({
      data: {
        key: "COMPANY_CONTRIBUTOR",
        displayName: "Company Contributor",
        description: "Works under a company entity; may be assigned to multiple projects.",
        appliesScope: "COMPANY",
        system: true,
      },
    }),
    prisma.roleDefinition.create({
      data: {
        key: "PROJECT_CONTRIBUTOR",
        displayName: "Project Contributor",
        description: "Executes work on assigned projects and workflow nodes.",
        appliesScope: "PROJECT",
        system: true,
      },
    }),
  ]);

  const [roleGroupAdmin, roleCompanyAdmin, roleProjectManager, roleCompanyContributor, roleProjectContributor] = roles;

  const roleKeyToPerms: Record<string, string[]> = {
    GROUP_ADMIN: ALL_PERMS,
    COMPANY_ADMIN: COMPANY_ADMIN_PERMS,
    PROJECT_MANAGER: PROJECT_MANAGER_PERMS,
    COMPANY_CONTRIBUTOR: COMPANY_CONTRIBUTOR_PERMS,
    PROJECT_CONTRIBUTOR: PROJECT_CONTRIBUTOR_PERMS,
  };

  const allRoleRows = await prisma.roleDefinition.findMany();
  const allPermRows = await prisma.permissionDefinition.findMany();
  const permIdByKey = Object.fromEntries(allPermRows.map((p) => [p.key, p.id]));

  for (const r of allRoleRows) {
    const keys = roleKeyToPerms[r.key];
    if (!keys) continue;
    for (const key of keys) {
      const pid = permIdByKey[key];
      if (!pid) continue;
      await prisma.rolePermission.create({
        data: { roleDefinitionId: r.id, permissionDefinitionId: pid, allowed: true },
      });
    }
  }

  const passwordPlain = "demo1234";
  const passwordHash = await hash(passwordPlain, 10);
  const demoSuperAdminAccounts = [
    { email: "admin@jdphoebe.local", name: "Group Super Admin" },
    { email: "admin2@jdphoebe.local", name: "Group Super Admin 2" },
    { email: "admin3@jdphoebe.local", name: "Group Super Admin 3" },
  ];

  const group = await prisma.orgGroup.create({
    data: {
      name: "J.D. Phoebe Group",
      introduction:
        "Cross-sector collaboration across academia, law, healthcare, media, and global trade—building a borderless network to empower minds, secure legacies, and revitalize culture.",
      status: OrgGroupStatus.ACTIVE,
    },
  });

  const legalCo = await prisma.company.create({
    data: {
      orgGroupId: group.id,
      name: "J.D. Phoebe Legal Affairs",
      companyType: "Legal & compliance",
      introduction: "Legal strategy, governance, and partnership structuring for the group and portfolio companies.",
      status: CompanyStatus.ACTIVE,
      onboardingMaterials: {
        create: {
          packageUrl: "https://jdphoebe.local/demo/legal-onboarding-pack",
          packageVersion: "v1",
          deadlineDays: 14,
        },
      },
    },
  });

  const researchCo = await prisma.company.create({
    data: {
      orgGroupId: group.id,
      name: "J.D. Phoebe Research & Insights",
      companyType: "Research",
      introduction: "Market, policy, and academic research supporting group initiatives and client engagements.",
      status: CompanyStatus.ACTIVE,
    },
  });

  const mediaCo = await prisma.company.create({
    data: {
      orgGroupId: group.id,
      name: "J.D. Phoebe Media & Culture",
      companyType: "Media",
      introduction: "Storytelling, brand, and cultural programs aligned with the group's sustainability mission.",
      status: CompanyStatus.ACTIVE,
    },
  });

  const superAdmin = await prisma.user.create({
    data: {
      email: demoSuperAdminAccounts[0]!.email,
      passwordHash,
      name: demoSuperAdminAccounts[0]!.name,
      title: "Group Office",
      isSuperAdmin: true,
      active: true,
    },
  });

  await prisma.user.createMany({
    data: demoSuperAdminAccounts.slice(1).map((account) => ({
      email: account.email,
      passwordHash,
      name: account.name,
      title: "Group Office",
      isSuperAdmin: true,
      active: true,
    })),
  });

  const groupAdmin = await prisma.user.create({
    data: {
      email: "group.admin@jdphoebe.local",
      passwordHash,
      name: "Alex Group Admin",
      title: "Chief of Staff",
      active: true,
    },
  });

  const companyAdmin = await prisma.user.create({
    data: {
      email: "legal.admin@jdphoebe.local",
      passwordHash,
      name: "Blake Company Admin",
      title: "Managing Counsel",
      active: true,
    },
  });

  const pm = await prisma.user.create({
    data: {
      email: "pm@jdphoebe.local",
      passwordHash,
      name: "Casey Project Manager",
      title: "Engagement Lead",
      active: true,
    },
  });

  const staff = await prisma.user.create({
    data: {
      email: "staff@jdphoebe.local",
      passwordHash,
      name: "Dana Staff",
      title: "Analyst",
      active: true,
    },
  });

  const onboardingDemo = await prisma.user.create({
    data: {
      email: "onboarding.demo@jdphoebe.local",
      passwordHash,
      name: "Eli Onboarding Demo",
      title: "Associate",
      active: true,
    },
  });

  await prisma.groupMembership.create({
    data: {
      userId: groupAdmin.id,
      orgGroupId: group.id,
      roleDefinitionId: roleGroupAdmin.id,
    },
  });

  await prisma.companyMembership.createMany({
    data: [
      { userId: companyAdmin.id, companyId: legalCo.id, roleDefinitionId: roleCompanyAdmin.id },
      { userId: pm.id, companyId: legalCo.id, roleDefinitionId: roleCompanyContributor.id },
      { userId: staff.id, companyId: legalCo.id, roleDefinitionId: roleCompanyContributor.id },
      { userId: staff.id, companyId: researchCo.id, roleDefinitionId: roleCompanyContributor.id },
      { userId: onboardingDemo.id, companyId: legalCo.id, roleDefinitionId: roleCompanyContributor.id },
    ],
  });

  const obDeadline = new Date();
  obDeadline.setUTCDate(obDeadline.getUTCDate() + 14);
  const obPackUrl = "https://jdphoebe.local/demo/legal-onboarding-pack";
  const nowSeed = new Date();

  await prisma.memberOnboarding.create({
    data: {
      userId: staff.id,
      companyId: legalCo.id,
      packageUrl: obPackUrl,
      packageVersion: "v1",
      deadlineAt: obDeadline,
      completedAt: nowSeed,
      checklistItems: {
        create: [
          { itemKey: "OB_READ_PACKAGE", sortOrder: 0, completedAt: nowSeed },
          { itemKey: "OB_ACK_POLICIES", sortOrder: 1, completedAt: nowSeed },
          { itemKey: "OB_SUPERVISOR_MEET", sortOrder: 2, completedAt: nowSeed },
        ],
      },
    },
  });

  await prisma.memberOnboarding.create({
    data: {
      userId: onboardingDemo.id,
      companyId: legalCo.id,
      packageUrl: obPackUrl,
      packageVersion: "v1",
      deadlineAt: obDeadline,
      checklistItems: {
        create: [
          { itemKey: "OB_READ_PACKAGE", sortOrder: 0 },
          { itemKey: "OB_ACK_POLICIES", sortOrder: 1 },
          { itemKey: "OB_SUPERVISOR_MEET", sortOrder: 2 },
        ],
      },
    },
  });

  const partnershipProject = await prisma.project.create({
    data: {
      companyId: legalCo.id,
      name: "Strategic Partnerships 2026",
      description: "Alliance pipeline across universities, NGOs, and commercial partners.",
      ownerId: pm.id,
      status: ProjectStatus.ACTIVE,
      priority: Priority.HIGH,
      deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 45),
      progressPercent: 35,
    },
  });

  const insightProject = await prisma.project.create({
    data: {
      companyId: researchCo.id,
      name: "Policy Insight Hub 2026",
      description: "Cross-company policy and research support for active delivery projects.",
      ownerId: groupAdmin.id,
      status: ProjectStatus.ACTIVE,
      priority: Priority.MEDIUM,
      deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60),
      progressPercent: 22,
    },
  });

  await prisma.projectMembership.createMany({
    data: [
      { userId: pm.id, projectId: partnershipProject.id, roleDefinitionId: roleProjectManager.id },
      { userId: staff.id, projectId: partnershipProject.id, roleDefinitionId: roleProjectContributor.id },
      { userId: companyAdmin.id, projectId: partnershipProject.id, roleDefinitionId: roleCompanyAdmin.id },
      { userId: groupAdmin.id, projectId: insightProject.id, roleDefinitionId: roleProjectManager.id },
      { userId: staff.id, projectId: insightProject.id, roleDefinitionId: roleProjectContributor.id },
    ],
  });

  const layer = await prisma.workflowLayer.create({
    data: {
      projectId: partnershipProject.id,
      name: "Partnership lifecycle",
      sortOrder: 0,
      collapsedDefault: false,
    },
  });

  const nIntake = await prisma.workflowNode.create({
    data: {
      projectId: partnershipProject.id,
      layerId: layer.id,
      nodeType: WorkflowNodeType.MILESTONE,
      title: "Intake & alignment",
      status: WorkflowNodeStatus.DONE,
      progressPercent: 100,
      posX: 40,
      posY: 80,
    },
  });

  const nDd = await prisma.workflowNode.create({
    data: {
      projectId: partnershipProject.id,
      layerId: layer.id,
      nodeType: WorkflowNodeType.TASK,
      title: "Due diligence pack",
      status: WorkflowNodeStatus.IN_PROGRESS,
      progressPercent: 50,
      posX: 240,
      posY: 80,
    },
  });

  const nApproval = await prisma.workflowNode.create({
    data: {
      projectId: partnershipProject.id,
      layerId: layer.id,
      nodeType: WorkflowNodeType.APPROVAL,
      title: "Group legal approval",
      status: WorkflowNodeStatus.WAITING,
      progressPercent: 0,
      posX: 440,
      posY: 40,
      dueAt: new Date(Date.now() - 2 * 86400000),
    },
  });

  const nParallel = await prisma.workflowNode.create({
    data: {
      projectId: partnershipProject.id,
      layerId: layer.id,
      nodeType: WorkflowNodeType.TASK,
      title: "Partner onboarding (parallel track)",
      status: WorkflowNodeStatus.NOT_STARTED,
      progressPercent: 0,
      posX: 440,
      posY: 140,
    },
  });

  const nBlocked = await prisma.workflowNode.create({
    data: {
      projectId: partnershipProject.id,
      layerId: layer.id,
      nodeType: WorkflowNodeType.WAITING,
      title: "External counsel response",
      status: WorkflowNodeStatus.BLOCKED,
      progressPercent: 0,
      posX: 640,
      posY: 80,
    },
  });

  await prisma.workflowNodeAssignee.createMany({
    data: [
      { workflowNodeId: nDd.id, userId: staff.id, responsibility: "Primary author" },
      { workflowNodeId: nApproval.id, userId: companyAdmin.id, responsibility: "Approver" },
      { workflowNodeId: nParallel.id, userId: pm.id, responsibility: "Coordinator" },
    ],
  });

  await prisma.workflowEdge.createMany({
    data: [
      { projectId: partnershipProject.id, fromNodeId: nIntake.id, toNodeId: nDd.id, kind: WorkflowEdgeKind.SEQUENTIAL },
      { projectId: partnershipProject.id, fromNodeId: nDd.id, toNodeId: nApproval.id, kind: WorkflowEdgeKind.DEPENDENCY },
      { projectId: partnershipProject.id, fromNodeId: nDd.id, toNodeId: nParallel.id, kind: WorkflowEdgeKind.PARALLEL },
      { projectId: partnershipProject.id, fromNodeId: nApproval.id, toNodeId: nBlocked.id, kind: WorkflowEdgeKind.SEQUENTIAL },
      { projectId: partnershipProject.id, fromNodeId: nParallel.id, toNodeId: nBlocked.id, kind: WorkflowEdgeKind.BRANCH },
    ],
  });

  await prisma.auditLogEntry.create({
    data: {
      actorId: superAdmin.id,
      entityType: "ORG_GROUP",
      entityId: group.id,
      action: "SEED",
      newValue: "Demo dataset installed",
    },
  });

  await prisma.companionProfile.createMany({
    data: [
      {
        userId: superAdmin.id,
        species: CompanionSpecies.BEAR,
        companionManifestId: "bear",
        name: "Atlas",
        mood: "STEADY",
        level: 4,
        selectedAt: new Date(),
      },
      {
        userId: groupAdmin.id,
        species: CompanionSpecies.CAT,
        companionManifestId: "cat",
        name: "Nova",
        mood: "CALM",
        level: 3,
        selectedAt: new Date(),
      },
      {
        userId: companyAdmin.id,
        species: CompanionSpecies.BEAVER,
        companionManifestId: "beaver",
        name: "Ripple",
        mood: "FOCUSED",
        level: 2,
        selectedAt: new Date(),
      },
      {
        userId: pm.id,
        species: CompanionSpecies.BUNNY,
        companionManifestId: "bunny",
        name: "Sprint",
        mood: "MOTIVATED",
        level: 2,
        selectedAt: new Date(),
      },
      {
        userId: staff.id,
        species: CompanionSpecies.HAMSTER,
        companionManifestId: "hamster",
        name: "Pebble",
        mood: "CURIOUS",
        level: 2,
        selectedAt: new Date(),
      },
    ],
  });

  await prisma.user.updateMany({
    data: { companionIntroCompletedAt: new Date() },
  });

  const weekStart = new Date();
  weekStart.setUTCHours(0, 0, 0, 0);
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));

  await prisma.performanceSnapshot.createMany({
    data: [
      {
        userId: superAdmin.id,
        weekStart,
        executionScore: 82,
        collaborationScore: 76,
        knowledgeScore: 70,
        recognitionScore: 68,
        trendDelta: 4,
      },
      {
        userId: groupAdmin.id,
        weekStart,
        executionScore: 78,
        collaborationScore: 84,
        knowledgeScore: 66,
        recognitionScore: 72,
        trendDelta: 6,
      },
      {
        userId: companyAdmin.id,
        weekStart,
        executionScore: 73,
        collaborationScore: 69,
        knowledgeScore: 61,
        recognitionScore: 63,
        trendDelta: 2,
      },
      {
        userId: pm.id,
        weekStart,
        executionScore: 86,
        collaborationScore: 80,
        knowledgeScore: 64,
        recognitionScore: 77,
        trendDelta: 8,
      },
      {
        userId: staff.id,
        weekStart,
        executionScore: 75,
        collaborationScore: 83,
        knowledgeScore: 72,
        recognitionScore: 79,
        trendDelta: 10,
      },
    ],
  });



  await prisma.projectRelation.createMany({
    data: [
      {
        fromProjectId: partnershipProject.id,
        toProjectId: insightProject.id,
        relationType: ProjectRelationType.DEPENDS_ON,
        note: "Partnership decisions depend on periodic policy brief updates.",
      },
      {
        fromProjectId: insightProject.id,
        toProjectId: partnershipProject.id,
        relationType: ProjectRelationType.SHARED_ASSET,
        note: "Shares playbooks and legal reference assets back to delivery project.",
      },
    ],
    skipDuplicates: true,
  });

  await prisma.knowledgeAsset.createMany({
    data: [
      {
        projectId: partnershipProject.id,
        companyId: legalCo.id,
        authorId: pm.id,
        title: "Partnership due diligence template",
        summary: "Reusable checklist for legal + risk review.",
        content: "Sections: Background, Legal posture, Risk matrix, Escalation triggers.",
        layer: KnowledgeLayer.TEMPLATE_PLAYBOOK,
        tags: "template,legal,due-diligence",
      },
      {
        projectId: partnershipProject.id,
        companyId: legalCo.id,
        authorId: staff.id,
        title: "Counsel communication style guide",
        summary: "Internal translation and phrasing preferences.",
        content: "Preferred structure: context -> ask -> deadline -> fallback.",
        layer: KnowledgeLayer.INTERNAL_INSIGHT,
        tags: "translation,communication,insight",
      },
      {
        projectId: partnershipProject.id,
        companyId: legalCo.id,
        authorId: companyAdmin.id,
        title: "Partner onboarding clause snippets",
        summary: "Reusable contract snippets for onboarding packs.",
        content: "Clause set A/B/C for timeline, confidentiality, and review windows.",
        layer: KnowledgeLayer.REUSABLE_OUTPUT,
        tags: "snippets,contract,reuse",
      },
      {
        authorId: groupAdmin.id,
        companyId: legalCo.id,
        title: "Reference: NGO partnership legal framework",
        summary: "External references and legal resource links.",
        content: "Curated references for NGO partnership legal structures.",
        layer: KnowledgeLayer.REFERENCE_RESOURCE,
        tags: "reference,ngo,policy",
        sourceUrl: "https://example.com/legal-framework",
      },
    ],
  });
  const recRows = await prisma.$transaction([
    prisma.recognitionEvent.create({
      data: {
        fromUserId: pm.id,
        toUserId: staff.id,
        projectId: partnershipProject.id,
        workflowNodeId: nDd.id,
        mode: RecognitionMode.PUBLIC,
        tagCategory: RecognitionTagCategory.RESULT,
        secondaryLabelKey: "quality_outcome",
        tagLabel: "Quality outcome",
        message: "Due diligence draft was crisp and ahead of schedule.",
      },
    }),
    prisma.recognitionEvent.create({
      data: {
        fromUserId: companyAdmin.id,
        toUserId: pm.id,
        projectId: partnershipProject.id,
        workflowNodeId: nApproval.id,
        mode: RecognitionMode.SEMI_ANONYMOUS,
        tagCategory: RecognitionTagCategory.THINKING,
        secondaryLabelKey: "good_judgment",
        tagLabel: "Good judgment",
        message: "Escalation notes made legal review much faster.",
      },
    }),
    prisma.recognitionEvent.create({
      data: {
        fromUserId: groupAdmin.id,
        toUserId: companyAdmin.id,
        projectId: partnershipProject.id,
        mode: RecognitionMode.PUBLIC,
        tagCategory: RecognitionTagCategory.STABILITY,
        secondaryLabelKey: "steady_under_pressure",
        tagLabel: "Steady under pressure",
        message: "Unblocked partner counsel follow-up quickly.",
      },
    }),
  ]);

  const { appendRecognitionScores } = await import("../lib/scoring");
  for (const r of recRows) {
    const proj = r.projectId ? await prisma.project.findFirst({ where: { id: r.projectId } }) : null;
    await appendRecognitionScores(prisma, {
      toUserId: r.toUserId,
      tagCategory: r.tagCategory,
      recognitionId: r.id,
      companyId: proj?.companyId ?? legalCo.id,
      projectId: r.projectId,
    });
  }

  await prisma.lifecycleTriggerRule.createMany({
    data: [
      {
        kind: "FEEDBACK",
        windowDays: 30,
        threshold: 3,
        scope: "GLOBAL",
        companyId: null,
        categoryMode: "TOTAL_COUNT",
        active: true,
      },
      {
        kind: "RECOGNITION",
        windowDays: 30,
        threshold: 3,
        scope: "GLOBAL",
        companyId: null,
        categoryMode: "TOTAL_COUNT",
        active: true,
      },
    ],
  });

  console.log("Seed OK. Demo password for all seeded users:", passwordPlain);
  console.log("Onboarding walkthrough: sign in as onboarding.demo@jdphoebe.local (pending checklist). Dana Staff has completed onboarding for Legal Affairs.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
