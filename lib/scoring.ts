import type {
  AbilityDimension,
  FeedbackCategory,
  LeaderboardCategory,
  Prisma,
  PrismaClient,
  RecognitionTagCategory,
} from "@prisma/client";
import { ScorePolarity } from "@prisma/client";

type ScoreDb = PrismaClient | Prisma.TransactionClient;

function recognitionPrimaryBoard(cat: RecognitionTagCategory): LeaderboardCategory {
  switch (cat) {
    case "RESULT":
      return "EXECUTION";
    case "COLLABORATION":
    case "CULTURE":
      return "COLLABORATION";
    case "THINKING":
    case "CREATIVITY":
      return "KNOWLEDGE";
    case "STABILITY":
      return "EXECUTION";
    case "GUIDANCE":
      return "RECOGNITION";
    default:
      return "RECOGNITION";
  }
}

function recognitionAbility(cat: RecognitionTagCategory): AbilityDimension {
  switch (cat) {
    case "RESULT":
      return "EXECUTION";
    case "COLLABORATION":
    case "CULTURE":
      return "COLLABORATION";
    case "THINKING":
      return "JUDGMENT";
    case "CREATIVITY":
      return "CREATIVITY";
    case "STABILITY":
      return "RELIABILITY";
    case "GUIDANCE":
      return "GUIDANCE";
    default:
      return "COLLABORATION";
  }
}

export async function appendRecognitionScores(
  prisma: ScoreDb,
  input: {
    toUserId: string;
    tagCategory: RecognitionTagCategory;
    recognitionId: string;
    companyId?: string | null;
    projectId?: string | null;
  },
) {
  const { toUserId, tagCategory, recognitionId, companyId, projectId } = input;
  const primary = recognitionPrimaryBoard(tagCategory);
  const ability = recognitionAbility(tagCategory);

  await prisma.scoreLedgerEntry.createMany({
    data: [
      {
        userId: toUserId,
        leaderboardCategory: "RECOGNITION",
        abilityDimension: null,
        polarity: ScorePolarity.POSITIVE,
        delta: 4,
        reasonKey: "recognition_received",
        sourceType: "RECOGNITION_EVENT",
        sourceId: recognitionId,
        companyId: companyId ?? undefined,
        projectId: projectId ?? undefined,
      },
      {
        userId: toUserId,
        leaderboardCategory: primary,
        abilityDimension: ability,
        polarity: ScorePolarity.POSITIVE,
        delta: 2,
        reasonKey: `recognition_${tagCategory.toLowerCase()}`,
        sourceType: "RECOGNITION_EVENT",
        sourceId: recognitionId,
        companyId: companyId ?? undefined,
        projectId: projectId ?? undefined,
      },
    ],
  });
}

function feedbackDimensions(cat: FeedbackCategory): { board: LeaderboardCategory; dim: AbilityDimension }[] {
  switch (cat) {
    case "COMMUNICATION":
      return [
        { board: "COLLABORATION", dim: "COLLABORATION" },
        { board: "KNOWLEDGE", dim: "JUDGMENT" },
      ];
    case "DELIVERY_QUALITY":
      return [
        { board: "EXECUTION", dim: "EXECUTION" },
        { board: "EXECUTION", dim: "RELIABILITY" },
      ];
    case "FOLLOW_THROUGH":
      return [
        { board: "EXECUTION", dim: "RELIABILITY" },
        { board: "COLLABORATION", dim: "COLLABORATION" },
      ];
    case "DOCUMENTATION":
      return [{ board: "KNOWLEDGE", dim: "KNOWLEDGE" }];
    case "COLLABORATION_RESPONSIVENESS":
      return [{ board: "COLLABORATION", dim: "COLLABORATION" }];
    default:
      return [{ board: "EXECUTION", dim: "RELIABILITY" }];
  }
}

export async function appendKnowledgeReuseScore(
  prisma: ScoreDb,
  input: { userId: string; assetId: string; companyId?: string | null; projectId?: string | null },
) {
  await prisma.scoreLedgerEntry.create({
    data: {
      userId: input.userId,
      leaderboardCategory: "KNOWLEDGE",
      abilityDimension: "KNOWLEDGE",
      polarity: ScorePolarity.POSITIVE,
      delta: 1,
      reasonKey: "knowledge_reused",
      sourceType: "KNOWLEDGE_ASSET",
      sourceId: input.assetId,
      companyId: input.companyId ?? undefined,
      projectId: input.projectId ?? undefined,
    },
  });
}

export async function appendFeedbackScores(
  prisma: ScoreDb,
  input: {
    toUserId: string;
    category: FeedbackCategory;
    feedbackId: string;
    companyId?: string | null;
    projectId?: string | null;
  },
) {
  const rows = feedbackDimensions(input.category).map(({ board, dim }) => ({
    userId: input.toUserId,
    leaderboardCategory: board,
    abilityDimension: dim,
    polarity: ScorePolarity.NEGATIVE,
    delta: -2,
    reasonKey: `feedback_${input.category.toLowerCase()}`,
    sourceType: "FEEDBACK_EVENT",
    sourceId: input.feedbackId,
    companyId: input.companyId ?? undefined,
    projectId: input.projectId ?? undefined,
  }));
  await prisma.scoreLedgerEntry.createMany({ data: rows });
}

export async function clearRecognitionScores(prisma: ScoreDb, recognitionId: string) {
  await prisma.scoreLedgerEntry.deleteMany({
    where: {
      sourceType: "RECOGNITION_EVENT",
      sourceId: recognitionId,
    },
  });
}

export async function clearFeedbackScores(prisma: ScoreDb, feedbackId: string) {
  await prisma.scoreLedgerEntry.deleteMany({
    where: {
      sourceType: "FEEDBACK_EVENT",
      sourceId: feedbackId,
    },
  });
}

/** When a map node moves to DONE, credit assignees (or project owner if unassigned). Idempotent per node + reason. */
export async function appendNodeCompletionLedgers(
  prisma: ScoreDb,
  input: {
    nodeId: string;
    projectId: string;
    companyId?: string | null;
    userIds: string[];
    onTime: boolean;
  },
) {
  const reasonKey = input.onTime ? "node_completed_on_time" : "node_completed_late";
  const existing = await prisma.scoreLedgerEntry.findFirst({
    where: { sourceType: "WORKFLOW_NODE", sourceId: input.nodeId, reasonKey },
  });
  if (existing) return;

  const polarity = input.onTime ? ScorePolarity.POSITIVE : ScorePolarity.NEGATIVE;
  const delta = input.onTime ? 3 : -2;
  await prisma.scoreLedgerEntry.createMany({
    data: input.userIds.map((userId) => ({
      userId,
      leaderboardCategory: "EXECUTION" as const,
      abilityDimension: "EXECUTION" as const,
      polarity,
      delta,
      reasonKey,
      sourceType: "WORKFLOW_NODE",
      sourceId: input.nodeId,
      companyId: input.companyId ?? undefined,
      projectId: input.projectId,
    })),
  });
}

/** Open node still not DONE after effective due — call from status updates when appropriate. */
export async function appendNodeOverdueOpenLedger(
  prisma: ScoreDb,
  input: {
    nodeId: string;
    projectId: string;
    companyId?: string | null;
    userIds: string[];
  },
) {
  const reasonKey = "node_overdue_while_open";
  const existing = await prisma.scoreLedgerEntry.findFirst({
    where: { sourceType: "WORKFLOW_NODE", sourceId: input.nodeId, reasonKey },
  });
  if (existing) return;

  await prisma.scoreLedgerEntry.createMany({
    data: input.userIds.map((userId) => ({
      userId,
      leaderboardCategory: "EXECUTION" as const,
      abilityDimension: "RELIABILITY" as const,
      polarity: ScorePolarity.NEGATIVE,
      delta: -1,
      reasonKey,
      sourceType: "WORKFLOW_NODE",
      sourceId: input.nodeId,
      companyId: input.companyId ?? undefined,
      projectId: input.projectId,
    })),
  });
}

export async function sumAbilityByUser(
  prisma: ScoreDb,
  userId: string,
  since: Date,
  until: Date,
): Promise<Record<AbilityDimension, number>> {
  const dims: AbilityDimension[] = [
    "EXECUTION",
    "COLLABORATION",
    "JUDGMENT",
    "CREATIVITY",
    "KNOWLEDGE",
    "RELIABILITY",
    "GUIDANCE",
  ];
  const base = Object.fromEntries(dims.map((d) => [d, 0])) as Record<AbilityDimension, number>;
  const rows = await prisma.scoreLedgerEntry.groupBy({
    by: ["abilityDimension"],
    where: {
      userId,
      createdAt: { gte: since, lte: until },
      abilityDimension: { not: null },
    },
    _sum: { delta: true },
  });
  for (const r of rows) {
    if (r.abilityDimension) {
      base[r.abilityDimension] = r._sum.delta ?? 0;
    }
  }
  for (const d of dims) {
    base[d] = Math.max(12, Math.min(100, 50 + (base[d] ?? 0)));
  }
  return base;
}
