import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { Prisma } from "@prisma/client";
import { staffVisibilityWhere, type AccessUser } from "@/lib/access";
import { resolveBlobReadWriteToken } from "@/lib/blob";
import { storeUploadedFile } from "@/lib/file-storage";
import { prisma } from "@/lib/prisma";

const memberSelect = {
  id: true,
  name: true,
  title: true,
  avatarUrl: true,
} as const;

const attachmentSelect = {
  id: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
} as const;

const directMessageInclude = {
  attachments: { select: attachmentSelect },
  sender: { select: { id: true, name: true, avatarUrl: true } },
  recipient: { select: { id: true, name: true, avatarUrl: true } },
} satisfies Prisma.DirectMessageInclude;

const groupMessageInclude = {
  attachments: { select: attachmentSelect },
  sender: { select: { id: true, name: true, avatarUrl: true } },
  group: { select: { id: true, name: true } },
} satisfies Prisma.MessageGroupMessageInclude;

const groupMembershipInclude = {
  group: {
    include: {
      company: { select: { id: true, name: true, orgGroupId: true } },
      createdBy: { select: memberSelect },
      members: {
        where: { user: { active: true, deletedAt: null } },
        include: { user: { select: memberSelect } },
        orderBy: { createdAt: "asc" },
      },
    },
  },
} satisfies Prisma.MessageGroupMemberInclude;

const managedGroupInclude = {
  company: { select: { id: true, name: true, orgGroupId: true } },
  createdBy: { select: memberSelect },
  members: {
    where: { user: { active: true, deletedAt: null } },
    include: { user: { select: memberSelect } },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.MessageGroupInclude;

const managedGroupCoreSelect = {
  id: true,
  companyId: true,
  name: true,
  avatarUrl: true,
  createdById: true,
  members: {
    select: {
      userId: true,
      isAdmin: true,
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.MessageGroupSelect;

type DirectMessageRow = Prisma.DirectMessageGetPayload<{ include: typeof directMessageInclude }>;
type GroupMessageRow = Prisma.MessageGroupMessageGetPayload<{ include: typeof groupMessageInclude }>;
type GroupMembershipRow = Prisma.MessageGroupMemberGetPayload<{ include: typeof groupMembershipInclude }>;
type DirectPreferenceRow = Prisma.DirectMessagePreferenceGetPayload<{
  select: { peerId: true; mutedAt: true };
}>;
type VisiblePeerRow = {
  id: string;
  name: string;
  title: string | null;
  avatarUrl: string | null;
};
type LatestDirectMessageRef = {
  peerId: string;
  id: string;
};
type LatestGroupMessageRef = {
  groupId: string;
  id: string;
};
type GroupUnreadCountRow = {
  groupId: string;
  unreadCount: number;
};
type GroupThreadRecord = {
  id: string;
  name: string;
  avatarUrl: string | null;
  company: { id: string; name: string; orgGroupId: string };
  createdBy: { id: string; name: string; title: string | null; avatarUrl: string | null };
  members: { userId: string; isAdmin: boolean; user: VisiblePeerRow }[];
};

export type ChatThreadType = "direct" | "group";

export type ChatMemberOption = {
  id: string;
  name: string;
  title: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  isCreator: boolean;
};

export type ChatCompanyOption = {
  id: string;
  name: string;
  members: ChatMemberOption[];
};

export type ChatAttachment = {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  url: string;
  isImage: boolean;
};

export type ChatMessage = {
  id: string;
  threadKey: string;
  threadType: ChatThreadType;
  body: string | null;
  createdAt: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  isOwn: boolean;
  attachments: ChatAttachment[];
};

export type ChatThreadSummary = {
  key: string;
  type: ChatThreadType;
  id: string;
  name: string;
  subtitle: string | null;
  avatarUrl: string | null;
  unreadCount: number;
  latestMessageAt: string | null;
  latestMessageText: string | null;
  latestAttachmentCount: number;
  latestMessageFromSelf: boolean;
  canManage: boolean;
  canMentionAll: boolean;
  isMuted: boolean;
  memberCount: number | null;
  companyId: string | null;
  companyName: string | null;
};

export type ChatThreadDetail = ChatThreadSummary & {
  members: ChatMemberOption[];
  creatorId: string;
};

export type ChatPageData = {
  threads: ChatThreadSummary[];
  selectedThreadKey: string | null;
  selectedThread: ChatThreadDetail | null;
  messages: ChatMessage[];
  groupOptions: ChatCompanyOption[];
  groupOptionsLoaded: boolean;
  totalUnreadCount: number;
};

export type ChatThreadData = {
  thread: ChatThreadDetail | null;
  messages: ChatMessage[];
};

export type ChatThreadGroupPatch = {
  key: string;
  name: string;
  avatarUrl: string | null;
  memberIds: string[];
  adminIds: string[];
  creatorId: string;
};

function normalizeText(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text || null;
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180) || "file";
}

function isGroupAvatarUpload(value: unknown): value is File {
  return !!value && typeof value !== "string" && typeof value === "object" && "arrayBuffer" in value;
}

function uniq(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function sortByName<T extends { name: string }>(rows: T[]) {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

function sortThreads(threads: ChatThreadSummary[]) {
  return [...threads].sort((a, b) => {
    if (a.latestMessageAt && b.latestMessageAt) {
      const diff = Date.parse(b.latestMessageAt) - Date.parse(a.latestMessageAt);
      if (diff !== 0) return diff;
    } else if (a.latestMessageAt) {
      return -1;
    } else if (b.latestMessageAt) {
      return 1;
    }

    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

function toMemberOption(row: ChatMemberOption) {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    avatarUrl: row.avatarUrl,
    isAdmin: row.isAdmin,
    isCreator: row.isCreator,
  };
}

function attachmentUrl(id: string) {
  return `/api/messages/attachments/${id}`;
}

function makeThreadKey(type: ChatThreadType, id: string) {
  return `${type}:${id}`;
}

export function parseThreadKey(raw: string) {
  const [type, ...rest] = String(raw ?? "").split(":");
  const id = rest.join(":").trim();
  if ((type !== "direct" && type !== "group") || !id) return null;
  return { type, id } as { type: ChatThreadType; id: string };
}

function canManageCompanyMessaging(user: AccessUser, company: { id: string; orgGroupId: string }) {
  if (user.isSuperAdmin) return true;
  if (user.companyMemberships.some((membership) => membership.companyId === company.id && membership.roleDefinition.key === "COMPANY_ADMIN")) {
    return true;
  }
  return user.groupMemberships.some((membership) => membership.orgGroupId === company.orgGroupId && membership.roleDefinition.key === "GROUP_ADMIN");
}

function memberHasGroupAdminAccess(
  user: AccessUser,
  group: { createdById: string; members?: { userId: string; isAdmin: boolean }[] },
) {
  if (user.isSuperAdmin) return true;
  if (group.createdById === user.id) return true;
  return group.members?.some((member) => member.userId === user.id && member.isAdmin) ?? false;
}

function containsAtAllMention(body: string | null) {
  if (!body) return false;
  return /(^|\s)@all(?=\s|$)/i.test(body);
}

async function storeGroupAvatar(file: File, groupId: string) {
  const mime = String(file.type || "application/octet-stream");
  if (!mime.startsWith("image/")) {
    throw new Error("Group photo must be an image file.");
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > 6 * 1024 * 1024) {
    throw new Error("Group photo must be smaller than 6MB.");
  }
  const { storageKey, blobUrl } = await storeUploadedFile(buf, file.name || "group-photo", mime, `message-groups/${groupId}`);
  return blobUrl ?? `/${storageKey.replace(/\\/g, "/")}`;
}

function directConversationWhere(userId: string, peerId: string): Prisma.DirectMessageWhereInput {
  return {
    OR: [
      { senderId: userId, recipientId: peerId },
      { senderId: peerId, recipientId: userId },
    ],
  };
}

function serializeDirectMessage(row: DirectMessageRow, currentUserId: string): ChatMessage {
  const peerId = row.senderId === currentUserId ? row.recipientId : row.senderId;
  return {
    id: row.id,
    threadKey: makeThreadKey("direct", peerId),
    threadType: "direct",
    body: normalizeText(row.body),
    createdAt: row.createdAt.toISOString(),
    senderId: row.senderId,
    senderName: row.sender.name,
    senderAvatarUrl: row.sender.avatarUrl,
    isOwn: row.senderId === currentUserId,
    attachments: row.attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      url: attachmentUrl(attachment.id),
      isImage: String(attachment.mimeType ?? "").startsWith("image/"),
    })),
  };
}

function serializeGroupMessage(row: GroupMessageRow, currentUserId: string): ChatMessage {
  return {
    id: row.id,
    threadKey: makeThreadKey("group", row.groupId),
    threadType: "group",
    body: normalizeText(row.body),
    createdAt: row.createdAt.toISOString(),
    senderId: row.senderId,
    senderName: row.sender.name,
    senderAvatarUrl: row.sender.avatarUrl,
    isOwn: row.senderId === currentUserId,
    attachments: row.attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      url: attachmentUrl(attachment.id),
      isImage: String(attachment.mimeType ?? "").startsWith("image/"),
    })),
  };
}

async function listVisibleDirectPeers(user: AccessUser): Promise<VisiblePeerRow[]> {
  const where: Prisma.UserWhereInput = {
    active: true,
    deletedAt: null,
    id: { not: user.id },
    ...staffVisibilityWhere(user),
  };

  return prisma.user.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      title: true,
      avatarUrl: true,
    },
  });
}

async function listManageableCompanies(user: AccessUser) {
  if (user.isSuperAdmin) {
    return prisma.company.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, orgGroupId: true },
    });
  }

  const adminCompanyIds = uniq(
    user.companyMemberships
      .filter((membership) => membership.roleDefinition.key === "COMPANY_ADMIN")
      .map((membership) => membership.companyId),
  );
  const adminOrgIds = uniq(
    user.groupMemberships
      .filter((membership) => membership.roleDefinition.key === "GROUP_ADMIN")
      .map((membership) => membership.orgGroupId),
  );

  const OR: Prisma.CompanyWhereInput[] = [];
  if (adminCompanyIds.length) OR.push({ id: { in: adminCompanyIds } });
  if (adminOrgIds.length) OR.push({ orgGroupId: { in: adminOrgIds } });
  if (!OR.length) return [];

  return prisma.company.findMany({
    where: {
      deletedAt: null,
      OR,
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, orgGroupId: true },
  });
}

async function validateCompanyMessagingMembers(companyId: string, currentUserId: string, memberIds: string[]) {
  const uniqueMemberIds = uniq(memberIds);
  if (!uniqueMemberIds.length) return;

  const rows = await prisma.user.findMany({
    where: {
      active: true,
      deletedAt: null,
      id: { in: uniqueMemberIds },
      OR: [
        { id: currentUserId },
        { companyMemberships: { some: { companyId } } },
        { projectMemberships: { some: { project: { companyId } } } },
      ],
    },
    select: { id: true },
  });

  if (rows.length !== uniqueMemberIds.length) {
    throw new Error("One or more selected members are not eligible for this company group.");
  }
}

async function buildGroupOptions(user: AccessUser): Promise<ChatCompanyOption[]> {
  const companies = await listManageableCompanies(user);
  if (!companies.length) return [];
  const companyIds = companies.map((company) => company.id);

  const rows = await prisma.user.findMany({
    where: {
      active: true,
      deletedAt: null,
      OR: [
        { id: user.id },
        { companyMemberships: { some: { companyId: { in: companyIds } } } },
        { projectMemberships: { some: { project: { companyId: { in: companyIds } } } } },
      ],
    },
    orderBy: { name: "asc" },
    select: {
      ...memberSelect,
      companyMemberships: {
        where: { companyId: { in: companyIds } },
        select: { companyId: true },
      },
      projectMemberships: {
        where: { project: { companyId: { in: companyIds } } },
        select: {
          project: {
            select: { companyId: true },
          },
        },
      },
    },
  });

  return companies.map((company) => ({
    id: company.id,
    name: company.name,
    members: rows
      .filter(
        (row) =>
          row.id === user.id ||
          row.companyMemberships.some((membership) => membership.companyId === company.id) ||
          row.projectMemberships.some((membership) => membership.project.companyId === company.id),
      )
      .map((row) =>
        toMemberOption({
          ...row,
          isAdmin: false,
          isCreator: false,
        }),
      ),
  }));
}

function buildGroupOptionShells(companies: { id: string; name: string }[]): ChatCompanyOption[] {
  return companies.map((company) => ({
    id: company.id,
    name: company.name,
    members: [],
  }));
}

async function listDirectMessagePreferences(userId: string, peerIds: string[]): Promise<DirectPreferenceRow[]> {
  if (!peerIds.length) return [];
  return prisma.directMessagePreference.findMany({
    where: {
      userId,
      peerId: { in: peerIds },
    },
    select: {
      peerId: true,
      mutedAt: true,
    },
  });
}

export async function findMessagePeer(user: AccessUser, peerId: string) {
  const cleanPeerId = String(peerId ?? "").trim();
  if (!cleanPeerId) return null;

  const where: Prisma.UserWhereInput = {
    active: true,
    deletedAt: null,
    id: cleanPeerId,
    ...staffVisibilityWhere(user),
  };

  return prisma.user.findFirst({
    where,
    select: memberSelect,
  });
}

async function findMessageGroupMembership(user: AccessUser, groupId: string) {
  const cleanGroupId = String(groupId ?? "").trim();
  if (!cleanGroupId) return null;

  return prisma.messageGroupMember.findFirst({
    where: { groupId: cleanGroupId, userId: user.id },
    include: groupMembershipInclude,
  });
}

async function findMessageGroupMembershipCore(userId: string, groupId: string) {
  const cleanGroupId = String(groupId ?? "").trim();
  if (!cleanGroupId) return null;

  return prisma.messageGroupMember.findUnique({
    where: { groupId_userId: { groupId: cleanGroupId, userId } },
    select: { groupId: true, userId: true, isAdmin: true },
  });
}

async function findMessageGroupSendContext(userId: string, groupId: string) {
  const cleanGroupId = String(groupId ?? "").trim();
  if (!cleanGroupId) return null;

  return prisma.messageGroupMember.findUnique({
    where: { groupId_userId: { groupId: cleanGroupId, userId } },
    select: {
      groupId: true,
      isAdmin: true,
      group: {
        select: {
          createdById: true,
        },
      },
    },
  });
}

async function findManagedMessageGroupCore(user: AccessUser, groupId: string) {
  const cleanGroupId = String(groupId ?? "").trim();
  if (!cleanGroupId) return null;

  const group = await prisma.messageGroup.findFirst({
    where: {
      id: cleanGroupId,
      ...(user.isSuperAdmin ? {} : { members: { some: { userId: user.id } } }),
    },
    select: managedGroupCoreSelect,
  });

  if (!group) return null;
  if (!memberHasGroupAdminAccess(user, group)) {
    throw new Error("You do not have permission to manage this group.");
  }

  return group;
}

async function getLatestDirectMessagesByPeer(userId: string, peerIds: string[]) {
  if (!peerIds.length) return new Map<string, DirectMessageRow>();

  const refs = await prisma.$queryRaw<LatestDirectMessageRef[]>(Prisma.sql`
    SELECT DISTINCT ON ("peerId")
      "peerId",
      id
    FROM (
      SELECT
        dm.id,
        dm."createdAt",
        CASE
          WHEN dm."senderId" = ${userId} THEN dm."recipientId"
          ELSE dm."senderId"
        END AS "peerId"
      FROM "DirectMessage" dm
      WHERE
        (dm."senderId" = ${userId} AND dm."recipientId" IN (${Prisma.join(peerIds)}))
        OR (dm."recipientId" = ${userId} AND dm."senderId" IN (${Prisma.join(peerIds)}))
    ) ranked
    ORDER BY "peerId", "createdAt" DESC, id DESC
  `);

  if (!refs.length) return new Map<string, DirectMessageRow>();

  const rows = await prisma.directMessage.findMany({
    where: { id: { in: refs.map((ref) => ref.id) } },
    include: directMessageInclude,
  });

  const rowById = new Map(rows.map((row) => [row.id, row]));
  return new Map(refs.map((ref) => [ref.peerId, rowById.get(ref.id)]).filter((entry): entry is [string, DirectMessageRow] => !!entry[1]));
}

async function getLatestGroupMessagesByGroup(groupIds: string[]) {
  if (!groupIds.length) return new Map<string, GroupMessageRow>();

  const refs = await prisma.$queryRaw<LatestGroupMessageRef[]>(Prisma.sql`
    SELECT DISTINCT ON ("groupId")
      "groupId",
      id
    FROM "MessageGroupMessage"
    WHERE "groupId" IN (${Prisma.join(groupIds)})
    ORDER BY "groupId", "createdAt" DESC, id DESC
  `);

  if (!refs.length) return new Map<string, GroupMessageRow>();

  const rows = await prisma.messageGroupMessage.findMany({
    where: { id: { in: refs.map((ref) => ref.id) } },
    include: groupMessageInclude,
  });

  const rowById = new Map(rows.map((row) => [row.id, row]));
  return new Map(refs.map((ref) => [ref.groupId, rowById.get(ref.id)]).filter((entry): entry is [string, GroupMessageRow] => !!entry[1]));
}

async function getGroupUnreadCounts(userId: string, groupIds: string[]) {
  if (!groupIds.length) return new Map<string, number>();

  const rows = await prisma.$queryRaw<GroupUnreadCountRow[]>(Prisma.sql`
    SELECT
      mgm."groupId",
      COUNT(*)::int AS "unreadCount"
    FROM "MessageGroupMessage" mgm
    INNER JOIN "MessageGroupMember" mgmb
      ON mgmb."groupId" = mgm."groupId"
      AND mgmb."userId" = ${userId}
    WHERE
      mgm."groupId" IN (${Prisma.join(groupIds)})
      AND mgm."senderId" <> ${userId}
      AND (mgmb."lastReadAt" IS NULL OR mgm."createdAt" > mgmb."lastReadAt")
    GROUP BY mgm."groupId"
  `);

  return new Map(rows.map((row) => [row.groupId, Number(row.unreadCount)]));
}

function buildGroupThreadDetailFromGroupRecord(
  user: AccessUser,
  group: GroupThreadRecord,
  latest: GroupMessageRow | null,
  unreadCount: number,
  mutedAt: Date | null,
): ChatThreadDetail {
  const members = sortByName(
    group.members.map((member) =>
      toMemberOption({
        ...member.user,
        isAdmin: member.isAdmin || member.userId === group.createdBy.id,
        isCreator: member.userId === group.createdBy.id,
      }),
    ),
  );
  const key = makeThreadKey("group", group.id);
  return {
    key,
    type: "group",
    id: group.id,
    name: group.name,
    subtitle: group.company.name,
    avatarUrl: group.avatarUrl,
    unreadCount,
    latestMessageAt: latest?.createdAt.toISOString() ?? null,
    latestMessageText: latest ? normalizeText(latest.body) : null,
    latestAttachmentCount: latest?.attachments.length ?? 0,
    latestMessageFromSelf: latest ? latest.senderId === user.id : false,
    canManage: memberHasGroupAdminAccess(user, {
      createdById: group.createdBy.id,
      members: group.members.map((member) => ({ userId: member.userId, isAdmin: member.isAdmin })),
    }),
    canMentionAll: memberHasGroupAdminAccess(user, {
      createdById: group.createdBy.id,
      members: group.members.map((member) => ({ userId: member.userId, isAdmin: member.isAdmin })),
    }),
    isMuted: !!mutedAt,
    memberCount: members.length,
    companyId: group.company.id,
    companyName: group.company.name,
    members,
    creatorId: group.createdBy.id,
  };
}

function buildGroupThreadDetail(user: AccessUser, membership: GroupMembershipRow, latest: GroupMessageRow | null, unreadCount: number): ChatThreadDetail {
  return buildGroupThreadDetailFromGroupRecord(user, membership.group, latest, unreadCount, membership.mutedAt);
}

function detailToSummary(detail: ChatThreadDetail): ChatThreadSummary {
  return {
    key: detail.key,
    type: detail.type,
    id: detail.id,
    name: detail.name,
    subtitle: detail.subtitle,
    avatarUrl: detail.avatarUrl,
    unreadCount: detail.unreadCount,
    latestMessageAt: detail.latestMessageAt,
    latestMessageText: detail.latestMessageText,
    latestAttachmentCount: detail.latestAttachmentCount,
    latestMessageFromSelf: detail.latestMessageFromSelf,
    canManage: detail.canManage,
    canMentionAll: detail.canMentionAll,
    isMuted: detail.isMuted,
    memberCount: detail.memberCount,
    companyId: detail.companyId,
    companyName: detail.companyName,
  };
}

async function buildDirectThreadDetail(user: AccessUser, peerId: string) {
  const peer = await findMessagePeer(user, peerId);
  if (!peer) return null;

  const [unreadCount, latestMessage, preference] = await Promise.all([
    prisma.directMessage.count({
      where: {
        senderId: peer.id,
        recipientId: user.id,
        readAt: null,
      },
    }),
    prisma.directMessage.findFirst({
      where: directConversationWhere(user.id, peer.id),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: directMessageInclude,
    }),
    prisma.directMessagePreference.findUnique({
      where: {
        userId_peerId: {
          userId: user.id,
          peerId: peer.id,
        },
      },
      select: { mutedAt: true },
    }),
  ]);

  return {
    key: makeThreadKey("direct", peer.id),
    type: "direct" as const,
    id: peer.id,
    name: peer.name,
    subtitle: peer.title,
    avatarUrl: peer.avatarUrl,
    unreadCount,
    latestMessageAt: latestMessage?.createdAt.toISOString() ?? null,
    latestMessageText: latestMessage ? normalizeText(latestMessage.body) : null,
    latestAttachmentCount: latestMessage?.attachments.length ?? 0,
    latestMessageFromSelf: latestMessage ? latestMessage.senderId === user.id : false,
    canManage: false,
    canMentionAll: false,
    isMuted: !!preference?.mutedAt,
    memberCount: null,
    companyId: null,
    companyName: null,
    members: [],
    creatorId: "",
  };
}

async function getGroupThreadDetail(user: AccessUser, groupId: string) {
  const membership = await findMessageGroupMembership(user, groupId);
  if (!membership) return null;

  const [latest, unreadCounts] = await Promise.all([
    getLatestGroupMessagesByGroup([membership.groupId]),
    getGroupUnreadCounts(user.id, [membership.groupId]),
  ]);

  return buildGroupThreadDetail(user, membership, latest.get(membership.groupId) ?? null, unreadCounts.get(membership.groupId) ?? 0);
}

export async function getThreadDetail(user: AccessUser, threadKey: string): Promise<ChatThreadDetail | null> {
  const parsed = parseThreadKey(threadKey);
  if (!parsed) return null;

  return parsed.type === "direct" ? buildDirectThreadDetail(user, parsed.id) : getGroupThreadDetail(user, parsed.id);
}

async function buildDirectThreadSummaries(user: AccessUser, peers: VisiblePeerRow[]) {
  if (!peers.length) {
    return {
      summaries: [] as ChatThreadSummary[],
      details: new Map<string, ChatThreadDetail>(),
    };
  }

  const peerIds = peers.map((peer) => peer.id);
  const [unreadGroups, latestByPeer, preferences] = await Promise.all([
    prisma.directMessage.groupBy({
      by: ["senderId"],
      where: {
        recipientId: user.id,
        readAt: null,
        senderId: { in: peerIds },
      },
      _count: { _all: true },
    }),
    getLatestDirectMessagesByPeer(user.id, peerIds),
    listDirectMessagePreferences(user.id, peerIds),
  ]);

  const unreadByPeer = new Map(unreadGroups.map((row) => [row.senderId, row._count._all]));
  const preferenceByPeer = new Map(preferences.map((row) => [row.peerId, row]));

  const details = new Map<string, ChatThreadDetail>();
  const summaries = peers.map((peer) => {
    const latest = latestByPeer.get(peer.id);
    const preference = preferenceByPeer.get(peer.id);
    const key = makeThreadKey("direct", peer.id);
    const summary: ChatThreadSummary = {
      key,
      type: "direct",
      id: peer.id,
      name: peer.name,
      subtitle: peer.title,
      avatarUrl: peer.avatarUrl,
      unreadCount: unreadByPeer.get(peer.id) ?? 0,
      latestMessageAt: latest?.createdAt.toISOString() ?? null,
      latestMessageText: latest ? normalizeText(latest.body) : null,
      latestAttachmentCount: latest?.attachments.length ?? 0,
      latestMessageFromSelf: latest ? latest.senderId === user.id : false,
      canManage: false,
      canMentionAll: false,
      isMuted: !!preference?.mutedAt,
      memberCount: null,
      companyId: null,
      companyName: null,
    };

    details.set(key, { ...summary, members: [], creatorId: "" });
    return summary;
  });

  return { summaries, details };
}

async function buildGroupThreadSummaries(user: AccessUser, memberships: GroupMembershipRow[]) {
  if (!memberships.length) {
    return {
      summaries: [] as ChatThreadSummary[],
      details: new Map<string, ChatThreadDetail>(),
    };
  }

  const groupIds = memberships.map((membership) => membership.groupId);
  const [latestByGroup, unreadByGroup] = await Promise.all([
    getLatestGroupMessagesByGroup(groupIds),
    getGroupUnreadCounts(user.id, groupIds),
  ]);

  const rows = memberships.map((membership) => {
    const detail = buildGroupThreadDetail(
      user,
      membership,
      latestByGroup.get(membership.groupId) ?? null,
      unreadByGroup.get(membership.groupId) ?? 0,
    );

    return {
      summary: detailToSummary(detail),
      detail,
    };
  });

  const details = new Map<string, ChatThreadDetail>();
  for (const row of rows) details.set(row.summary.key, row.detail);
  return {
    summaries: rows.map((row) => row.summary),
    details,
  };
}

export async function getThreadMessages(user: AccessUser, threadKey: string, limit = 120): Promise<ChatMessage[]> {
  const parsed = parseThreadKey(threadKey);
  if (!parsed) return [];

  if (parsed.type === "direct") {
    const peer = await findMessagePeer(user, parsed.id);
    if (!peer) return [];

    const rows = await prisma.directMessage.findMany({
      where: directConversationWhere(user.id, peer.id),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      include: directMessageInclude,
    });

    return rows.reverse().map((row) => serializeDirectMessage(row, user.id));
  }

  const membership = await findMessageGroupMembershipCore(user.id, parsed.id);
  if (!membership) return [];

  const rows = await prisma.messageGroupMessage.findMany({
    where: { groupId: membership.groupId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    include: groupMessageInclude,
  });

  return rows.reverse().map((row) => serializeGroupMessage(row, user.id));
}

export async function getMessagingGroupOptions(user: AccessUser): Promise<ChatCompanyOption[]> {
  return buildGroupOptions(user);
}

export async function getMessagingPageData(
  user: AccessUser,
  preferredThreadKey?: string | null,
  options?: { includeGroupOptions?: boolean },
): Promise<ChatPageData> {
  const includeGroupOptions = options?.includeGroupOptions ?? true;

  const [peers, memberships, manageableCompanies, fullGroupOptions] = await Promise.all([
    listVisibleDirectPeers(user),
    prisma.messageGroupMember.findMany({
      where: { userId: user.id },
      include: groupMembershipInclude,
      orderBy: { createdAt: "asc" },
    }),
    listManageableCompanies(user),
    includeGroupOptions ? buildGroupOptions(user) : Promise.resolve(null),
  ]);

  const groupOptions = fullGroupOptions ?? buildGroupOptionShells(manageableCompanies);

  const [{ summaries: directSummaries, details: directDetails }, { summaries: groupSummaries, details: groupDetails }] =
    await Promise.all([buildDirectThreadSummaries(user, peers), buildGroupThreadSummaries(user, memberships)]);

  const details = new Map<string, ChatThreadDetail>([...directDetails, ...groupDetails]);
  const threads = sortThreads([...directSummaries, ...groupSummaries]);
  const selectedThreadKey = threads.some((thread) => thread.key === preferredThreadKey)
    ? String(preferredThreadKey)
    : (threads[0]?.key ?? null);

  return {
    threads,
    selectedThreadKey,
    selectedThread: selectedThreadKey ? details.get(selectedThreadKey) ?? null : null,
    messages: selectedThreadKey ? await getThreadMessages(user, selectedThreadKey) : [],
    groupOptions,
    groupOptionsLoaded: includeGroupOptions,
    totalUnreadCount: threads.reduce((sum, thread) => sum + (thread.isMuted ? 0 : thread.unreadCount), 0),
  };
}

export async function getMessagingThreadData(user: AccessUser, threadKey: string): Promise<ChatThreadData> {
  const cleanThreadKey = String(threadKey ?? "").trim();
  if (!cleanThreadKey) {
    return { thread: null, messages: [] };
  }

  const [thread, messages] = await Promise.all([getThreadDetail(user, cleanThreadKey), getThreadMessages(user, cleanThreadKey)]);
  return { thread, messages };
}

async function storeMessageFile(
  buf: Buffer,
  fileName: string,
  mimeType: string,
  messageId: string,
): Promise<{ storageKey: string; blobUrl: string | null; fileName: string; mimeType: string; sizeBytes: number }> {
  const safeName = sanitizeFileName(fileName);
  const blobToken = resolveBlobReadWriteToken();
  if (blobToken.token) {
    const { put } = await import("@vercel/blob");
    const key = `messages/${messageId}/${randomUUID()}-${safeName}`;
    const blob = await put(key, buf, { access: "public", token: blobToken.token });
    return { storageKey: key, blobUrl: blob.url, fileName: safeName, mimeType, sizeBytes: buf.length };
  }

  if (process.env.VERCEL === "1") {
    if (blobToken.ambiguousEnvVarNames.length > 0) {
      throw new Error(
        `Multiple Blob read/write tokens were found (${blobToken.ambiguousEnvVarNames.join(", ")}). Set BLOB_READ_WRITE_TOKEN explicitly for this app and redeploy.`,
      );
    }
    throw new Error(
      "File upload on Vercel requires BLOB_READ_WRITE_TOKEN or a single Vercel Blob *_READ_WRITE_TOKEN variable. Add one under Project Settings → Environment Variables, then redeploy.",
    );
  }

  const relDir = path.join("uploads", "messages", messageId);
  const dir = path.join(process.cwd(), relDir);
  await mkdir(dir, { recursive: true });
  const diskName = `${randomUUID()}-${safeName}`;
  const fullPath = path.join(dir, diskName);
  await writeFile(fullPath, buf);
  return {
    storageKey: path.join(relDir, diskName),
    blobUrl: null,
    fileName: safeName,
    mimeType,
    sizeBytes: buf.length,
  };
}

async function prepareUploads(files: File[], messageId: string) {
  const uploads = files.filter((file) => file.size > 0);
  if (!uploads.length) return [];
  if (uploads.length > 5) {
    throw new Error("You can attach up to 5 files per message.");
  }

  const attachmentData = [];
  for (const file of uploads) {
    if (file.size > 20 * 1024 * 1024) {
      throw new Error("Each file must be smaller than 20MB.");
    }
    const buf = Buffer.from(await file.arrayBuffer());
    attachmentData.push(await storeMessageFile(buf, file.name || "upload", file.type || "application/octet-stream", messageId));
  }
  return attachmentData;
}

async function createDirectThreadMessage(user: AccessUser, peerId: string, body: string, files: File[]) {
  const peer = await findMessagePeer(user, peerId);
  if (!peer) {
    throw new Error("The selected teammate is not available for messaging.");
  }

  const text = normalizeText(body);
  if (!text && files.filter((file) => file.size > 0).length === 0) {
    throw new Error("Type a message or attach at least one file.");
  }

  if (!files.some((file) => file.size > 0)) {
    const created = await prisma.directMessage.create({
      data: {
        senderId: user.id,
        recipientId: peer.id,
        body: text,
      },
      select: {
        id: true,
        body: true,
        createdAt: true,
      },
    });

    return {
      id: created.id,
      threadKey: makeThreadKey("direct", peer.id),
      threadType: "direct",
      body: normalizeText(created.body),
      createdAt: created.createdAt.toISOString(),
      senderId: user.id,
      senderName: user.name,
      senderAvatarUrl: user.avatarUrl,
      isOwn: true,
      attachments: [],
    } satisfies ChatMessage;
  }

  const messageId = randomUUID();
  const attachmentData = await prepareUploads(files, messageId);
  const created = await prisma.directMessage.create({
    data: {
      id: messageId,
      senderId: user.id,
      recipientId: peer.id,
      body: text,
      attachments: {
        create: attachmentData.map((attachment) => ({
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          storageKey: attachment.storageKey,
          blobUrl: attachment.blobUrl,
        })),
      },
    },
    include: directMessageInclude,
  });

  return serializeDirectMessage(created, user.id);
}

async function createGroupThreadMessage(user: AccessUser, groupId: string, body: string, files: File[]) {
  const sendContext = await findMessageGroupSendContext(user.id, groupId);
  if (!sendContext) {
    throw new Error("This group chat is not available.");
  }

  const text = normalizeText(body);
  if (
    containsAtAllMention(text) &&
    !user.isSuperAdmin &&
    !sendContext.isAdmin &&
    sendContext.group.createdById !== user.id
  ) {
    throw new Error("Only group admins, the group creator, or superadmins can use @all.");
  }
  if (!text && files.filter((file) => file.size > 0).length === 0) {
    throw new Error("Type a message or attach at least one file.");
  }

  if (!files.some((file) => file.size > 0)) {
    const created = await prisma.messageGroupMessage.create({
      data: {
        groupId: sendContext.groupId,
        senderId: user.id,
        body: text,
      },
      select: {
        id: true,
        body: true,
        createdAt: true,
      },
    });

    return {
      id: created.id,
      threadKey: makeThreadKey("group", sendContext.groupId),
      threadType: "group",
      body: normalizeText(created.body),
      createdAt: created.createdAt.toISOString(),
      senderId: user.id,
      senderName: user.name,
      senderAvatarUrl: user.avatarUrl,
      isOwn: true,
      attachments: [],
    } satisfies ChatMessage;
  }

  const messageId = randomUUID();
  const attachmentData = await prepareUploads(files, messageId);
  const created = await prisma.messageGroupMessage.create({
    data: {
      id: messageId,
      groupId: sendContext.groupId,
      senderId: user.id,
      body: text,
      attachments: {
        create: attachmentData.map((attachment) => ({
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          storageKey: attachment.storageKey,
          blobUrl: attachment.blobUrl,
        })),
      },
    },
    include: groupMessageInclude,
  });

  return serializeGroupMessage(created, user.id);
}

export async function createThreadMessage(user: AccessUser, threadKey: string, body: string, files: File[]) {
  const parsed = parseThreadKey(threadKey);
  if (!parsed) throw new Error("Missing thread key.");
  return parsed.type === "direct"
    ? createDirectThreadMessage(user, parsed.id, body, files)
    : createGroupThreadMessage(user, parsed.id, body, files);
}

export async function markThreadRead(user: AccessUser, threadKey: string) {
  const parsed = parseThreadKey(threadKey);
  if (!parsed) throw new Error("Missing thread key.");

  if (parsed.type === "direct") {
    const peer = await findMessagePeer(user, parsed.id);
    if (!peer) throw new Error("The selected teammate is not available for messaging.");
    const result = await prisma.directMessage.updateMany({
      where: {
        senderId: peer.id,
        recipientId: user.id,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  const updated = await prisma.messageGroupMember.updateMany({
    where: { groupId: parsed.id, userId: user.id },
    data: { lastReadAt: new Date() },
  });
  if (!updated.count) throw new Error("This group chat is not available.");
  return 1;
}

export async function setThreadMuted(user: AccessUser, threadKey: string, muted: boolean) {
  const parsed = parseThreadKey(threadKey);
  if (!parsed) throw new Error("Missing thread key.");

  if (parsed.type === "direct") {
    const peer = await findMessagePeer(user, parsed.id);
    if (!peer) throw new Error("The selected teammate is not available for messaging.");
    await prisma.directMessagePreference.upsert({
      where: {
        userId_peerId: {
          userId: user.id,
          peerId: peer.id,
        },
      },
      update: { mutedAt: muted ? new Date() : null },
      create: {
        userId: user.id,
        peerId: peer.id,
        mutedAt: muted ? new Date() : null,
      },
    });
    return { ok: true };
  }

  const updated = await prisma.messageGroupMember.updateMany({
    where: { groupId: parsed.id, userId: user.id },
    data: { mutedAt: muted ? new Date() : null },
  });
  if (!updated.count) throw new Error("This group chat is not available.");
  return { ok: true };
}

export async function createMessageGroup(user: AccessUser, input: { companyId: string; name: string; memberIds: string[] }) {
  const companyId = String(input.companyId ?? "").trim();
  const name = normalizeText(input.name);
  if (!companyId) throw new Error("Choose a company for the group chat.");
  if (!name) throw new Error("Group name is required.");

  const company = await prisma.company.findFirst({
    where: { id: companyId, deletedAt: null },
    select: { id: true, name: true, orgGroupId: true },
  });
  if (!company || !canManageCompanyMessaging(user, company)) {
    throw new Error("You do not have permission to create a group for this company.");
  }

  const memberIds = uniq([...input.memberIds, user.id]);
  if (memberIds.length < 2) {
    throw new Error("Select at least two members for the group chat.");
  }
  await validateCompanyMessagingMembers(companyId, user.id, memberIds);

  const now = new Date();
  const group = await prisma.messageGroup.create({
    data: {
      companyId: company.id,
      name,
      createdById: user.id,
      members: {
        create: memberIds.map((memberId) => ({
          userId: memberId,
          addedById: user.id,
          isAdmin: memberId === user.id,
          lastReadAt: now,
          mutedAt: null,
        })),
      },
    },
    include: managedGroupInclude,
  });

  const thread = buildGroupThreadDetailFromGroupRecord(user, group, null, 0, null);

  return { threadKey: thread.key, thread };
}

export async function updateMessageGroup(
  user: AccessUser,
  groupId: string,
  input: { name: string; memberIds: string[]; adminIds: string[]; groupPhoto?: File | null },
) {
  const group = await findManagedMessageGroupCore(user, groupId);
  if (!group) {
    throw new Error("This group chat is not available.");
  }

  const name = normalizeText(input.name);
  if (!name) throw new Error("Group name is required.");

  const nextMemberIds = uniq([...input.memberIds, user.id, group.createdById]);
  const nextAdminIds = uniq(input.adminIds);
  if (nextMemberIds.length < 2) {
    throw new Error("Select at least two members for the group chat.");
  }
  if (nextAdminIds.some((id) => !nextMemberIds.includes(id))) {
    throw new Error("Only current group members can be assigned as admins.");
  }

  const existingMemberIds = new Set(group.members.map((member) => member.userId));
  const toValidate = nextMemberIds.filter((memberId) => !existingMemberIds.has(memberId));
  await validateCompanyMessagingMembers(group.companyId, user.id, toValidate);
  const existingAdminIds = new Set(group.members.filter((member) => member.isAdmin).map((member) => member.userId));
  const toRemove = group.members.map((member) => member.userId).filter((memberId) => !nextMemberIds.includes(memberId));
  const toAdd = nextMemberIds.filter((memberId) => !existingMemberIds.has(memberId));
  const toKeep = nextMemberIds.filter((memberId) => existingMemberIds.has(memberId));
  const nextAdminSet = new Set([...nextAdminIds, group.createdById]);
  const promoteIds = toKeep.filter((memberId) => nextAdminSet.has(memberId) && !existingAdminIds.has(memberId));
  const demoteIds = toKeep.filter((memberId) => !nextAdminSet.has(memberId) && existingAdminIds.has(memberId));
  const nextAvatarUrl = input.groupPhoto && isGroupAvatarUpload(input.groupPhoto)
    ? await storeGroupAvatar(input.groupPhoto, group.id)
    : undefined;

  await prisma.$transaction([
    prisma.messageGroup.update({
      where: { id: group.id },
      data: {
        name,
        ...(nextAvatarUrl ? { avatarUrl: nextAvatarUrl } : {}),
      },
    }),
    prisma.messageGroupMember.deleteMany({
      where: {
        groupId: group.id,
        userId: { in: toRemove },
      },
    }),
    ...(toAdd.length
      ? [
          prisma.messageGroupMember.createMany({
            data: toAdd.map((memberId) => ({
              groupId: group.id,
              userId: memberId,
              addedById: user.id,
              isAdmin: memberId === group.createdById || nextAdminIds.includes(memberId),
              lastReadAt: new Date(),
              mutedAt: null,
            })),
          }),
        ]
      : []),
    ...(promoteIds.length
      ? [
          prisma.messageGroupMember.updateMany({
            where: { groupId: group.id, userId: { in: promoteIds } },
            data: { isAdmin: true },
          }),
        ]
      : []),
    ...(demoteIds.length
      ? [
          prisma.messageGroupMember.updateMany({
            where: { groupId: group.id, userId: { in: demoteIds } },
            data: { isAdmin: false },
          }),
        ]
      : []),
  ]);

  return {
    threadKey: makeThreadKey("group", group.id),
    threadPatch: {
      key: makeThreadKey("group", group.id),
      name,
      avatarUrl: nextAvatarUrl ?? group.avatarUrl,
      memberIds: nextMemberIds,
      adminIds: [...nextAdminSet],
      creatorId: group.createdById,
    } satisfies ChatThreadGroupPatch,
  };
}

export async function deleteMessageGroup(user: AccessUser, groupId: string) {
  const group = await findManagedMessageGroupCore(user, groupId);
  if (!group) {
    throw new Error("This group chat is not available.");
  }

  await prisma.messageGroup.delete({ where: { id: group.id } });
  return { ok: true, threadKey: makeThreadKey("group", group.id) };
}

export async function getMessagingUnreadCount(userId: string) {
  const [mutedDirectPreferences, groupRows] = await Promise.all([
    prisma.directMessagePreference.findMany({
      where: {
        userId,
        mutedAt: { not: null },
      },
      select: { peerId: true },
    }),
    prisma.$queryRaw<{ unreadCount: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS "unreadCount"
      FROM "MessageGroupMessage" mgm
      INNER JOIN "MessageGroupMember" mgmb
        ON mgmb."groupId" = mgm."groupId"
        AND mgmb."userId" = ${userId}
        AND mgmb."mutedAt" IS NULL
      WHERE
        mgm."senderId" <> ${userId}
        AND (mgmb."lastReadAt" IS NULL OR mgm."createdAt" > mgmb."lastReadAt")
    `),
  ]);

  const mutedPeerIds = mutedDirectPreferences.map((row) => row.peerId);
  const directUnread = await prisma.directMessage.count({
    where: {
      recipientId: userId,
      readAt: null,
      sender: {
        active: true,
        deletedAt: null,
      },
      ...(mutedPeerIds.length ? { senderId: { notIn: mutedPeerIds } } : {}),
    },
  });

  return directUnread + Number(groupRows[0]?.unreadCount ?? 0);
}

export async function getRecentMessagesForStream(userId: string, after: Date) {
  const [directRows, groupRows] = await Promise.all([
    prisma.directMessage.findMany({
      where: {
        createdAt: { gt: after },
        OR: [{ senderId: userId }, { recipientId: userId }],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 60,
      include: directMessageInclude,
    }),
    prisma.messageGroupMessage.findMany({
      where: {
        createdAt: { gt: after },
        group: {
          members: { some: { userId } },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 60,
      include: groupMessageInclude,
    }),
  ]);

  return [
    ...directRows.map((row) => ({ createdAt: row.createdAt, payload: serializeDirectMessage(row, userId) })),
    ...groupRows.map((row) => ({ createdAt: row.createdAt, payload: serializeGroupMessage(row, userId) })),
  ]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((row) => row.payload);
}

export async function findMessageAttachmentForUser(userId: string, attachmentId: string) {
  const directAttachment = await prisma.directMessageAttachment.findFirst({
    where: {
      id: attachmentId,
      message: {
        OR: [{ senderId: userId }, { recipientId: userId }],
      },
    },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      storageKey: true,
      blobUrl: true,
    },
  });
  if (directAttachment) return directAttachment;

  return prisma.messageGroupMessageAttachment.findFirst({
    where: {
      id: attachmentId,
      message: {
        group: {
          members: { some: { userId } },
        },
      },
    },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      storageKey: true,
      blobUrl: true,
    },
  });
}
