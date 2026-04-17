import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { Prisma } from "@prisma/client";
import { staffVisibilityWhere, type AccessUser } from "@/lib/access";
import { resolveBlobReadWriteToken } from "@/lib/blob";
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
  members: {
    where: { user: { active: true, deletedAt: null } },
    include: { user: { select: memberSelect } },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.MessageGroupInclude;

type DirectMessageRow = Prisma.DirectMessageGetPayload<{ include: typeof directMessageInclude }>;
type GroupMessageRow = Prisma.MessageGroupMessageGetPayload<{ include: typeof groupMessageInclude }>;
type GroupMembershipRow = Prisma.MessageGroupMemberGetPayload<{ include: typeof groupMembershipInclude }>;
type ManagedGroupRow = Prisma.MessageGroupGetPayload<{ include: typeof managedGroupInclude }>;
type DirectPreferenceRow = Prisma.DirectMessagePreferenceGetPayload<{
  select: { peerId: true; mutedAt: true };
}>;
type VisiblePeerRow = {
  id: string;
  name: string;
  title: string | null;
  avatarUrl: string | null;
};

export type ChatThreadType = "direct" | "group";

export type ChatMemberOption = {
  id: string;
  name: string;
  title: string | null;
  avatarUrl: string | null;
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
  isMuted: boolean;
  memberCount: number | null;
  companyId: string | null;
  companyName: string | null;
};

export type ChatThreadDetail = ChatThreadSummary & {
  members: ChatMemberOption[];
};

export type ChatPageData = {
  threads: ChatThreadSummary[];
  selectedThreadKey: string | null;
  selectedThread: ChatThreadDetail | null;
  messages: ChatMessage[];
  groupOptions: ChatCompanyOption[];
  totalUnreadCount: number;
};

function normalizeText(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text || null;
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180) || "file";
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

async function listCompanyMessagingCandidates(companyId: string, currentUserId: string): Promise<ChatMemberOption[]> {
  const rows = await prisma.user.findMany({
    where: {
      active: true,
      deletedAt: null,
      OR: [
        { id: currentUserId },
        { companyMemberships: { some: { companyId } } },
        { projectMemberships: { some: { project: { companyId } } } },
      ],
    },
    orderBy: { name: "asc" },
    select: memberSelect,
  });

  return rows.map(toMemberOption);
}

async function buildGroupOptions(user: AccessUser): Promise<ChatCompanyOption[]> {
  const companies = await listManageableCompanies(user);
  if (!companies.length) return [];

  const options = await Promise.all(
    companies.map(async (company) => ({
      id: company.id,
      name: company.name,
      members: await listCompanyMessagingCandidates(company.id, user.id),
    })),
  );

  return options;
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

async function findManagedMessageGroup(user: AccessUser, groupId: string) {
  const cleanGroupId = String(groupId ?? "").trim();
  if (!cleanGroupId) return null;

  const group = await prisma.messageGroup.findFirst({
    where: {
      id: cleanGroupId,
      members: { some: { userId: user.id } },
    },
    include: managedGroupInclude,
  });

  if (!group) return null;
  if (!canManageCompanyMessaging(user, group.company)) {
    throw new Error("You do not have permission to manage this group.");
  }

  return group;
}

async function buildDirectThreadSummaries(user: AccessUser, peers: VisiblePeerRow[]) {
  if (!peers.length) {
    return {
      summaries: [] as ChatThreadSummary[],
      details: new Map<string, ChatThreadDetail>(),
    };
  }

  const peerIds = peers.map((peer) => peer.id);
  const [unreadGroups, latestMessages, preferences] = await Promise.all([
    prisma.directMessage.groupBy({
      by: ["senderId"],
      where: {
        recipientId: user.id,
        readAt: null,
        senderId: { in: peerIds },
      },
      _count: { _all: true },
    }),
    Promise.all(
      peers.map((peer) =>
        prisma.directMessage.findFirst({
          where: directConversationWhere(user.id, peer.id),
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          include: directMessageInclude,
        }),
      ),
    ),
    listDirectMessagePreferences(user.id, peerIds),
  ]);

  const unreadByPeer = new Map(unreadGroups.map((row) => [row.senderId, row._count._all]));
  const latestByPeer = new Map<string, DirectMessageRow>();
  const preferenceByPeer = new Map(preferences.map((row) => [row.peerId, row]));

  for (const message of latestMessages) {
    if (!message) continue;
    const peerId = message.senderId === user.id ? message.recipientId : message.senderId;
    latestByPeer.set(peerId, message);
  }

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
      isMuted: !!preference?.mutedAt,
      memberCount: null,
      companyId: null,
      companyName: null,
    };

    details.set(key, { ...summary, members: [] });
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

  const rows = await Promise.all(
    memberships.map(async (membership) => {
      const [latest, unreadCount] = await Promise.all([
        prisma.messageGroupMessage.findFirst({
          where: { groupId: membership.groupId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          include: groupMessageInclude,
        }),
        prisma.messageGroupMessage.count({
          where: {
            groupId: membership.groupId,
            senderId: { not: user.id },
            ...(membership.lastReadAt ? { createdAt: { gt: membership.lastReadAt } } : {}),
          },
        }),
      ]);

      const members = sortByName(membership.group.members.map((member) => toMemberOption(member.user)));
      const key = makeThreadKey("group", membership.groupId);
      const summary: ChatThreadSummary = {
        key,
        type: "group",
        id: membership.groupId,
        name: membership.group.name,
        subtitle: membership.group.company.name,
        avatarUrl: null,
        unreadCount,
        latestMessageAt: latest?.createdAt.toISOString() ?? null,
        latestMessageText: latest ? normalizeText(latest.body) : null,
        latestAttachmentCount: latest?.attachments.length ?? 0,
        latestMessageFromSelf: latest ? latest.senderId === user.id : false,
        canManage: canManageCompanyMessaging(user, membership.group.company),
        isMuted: !!membership.mutedAt,
        memberCount: members.length,
        companyId: membership.group.company.id,
        companyName: membership.group.company.name,
      };

      return {
        summary,
        detail: {
          ...summary,
          members,
        } satisfies ChatThreadDetail,
      };
    }),
  );

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

  const membership = await findMessageGroupMembership(user, parsed.id);
  if (!membership) return [];

  const rows = await prisma.messageGroupMessage.findMany({
    where: { groupId: membership.groupId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    include: groupMessageInclude,
  });

  return rows.reverse().map((row) => serializeGroupMessage(row, user.id));
}

export async function getMessagingPageData(user: AccessUser, preferredThreadKey?: string | null): Promise<ChatPageData> {
  const [peers, memberships, groupOptions] = await Promise.all([
    listVisibleDirectPeers(user),
    prisma.messageGroupMember.findMany({
      where: { userId: user.id },
      include: groupMembershipInclude,
      orderBy: { createdAt: "asc" },
    }),
    buildGroupOptions(user),
  ]);

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
    totalUnreadCount: threads.reduce((sum, thread) => sum + (thread.isMuted ? 0 : thread.unreadCount), 0),
  };
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
  const membership = await findMessageGroupMembership(user, groupId);
  if (!membership) {
    throw new Error("This group chat is not available.");
  }

  const text = normalizeText(body);
  if (!text && files.filter((file) => file.size > 0).length === 0) {
    throw new Error("Type a message or attach at least one file.");
  }

  const messageId = randomUUID();
  const attachmentData = await prepareUploads(files, messageId);
  const created = await prisma.messageGroupMessage.create({
    data: {
      id: messageId,
      groupId: membership.groupId,
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

  await prisma.messageGroupMember.update({
    where: { groupId_userId: { groupId: membership.groupId, userId: user.id } },
    data: { lastReadAt: new Date() },
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

  const membership = await findMessageGroupMembership(user, parsed.id);
  if (!membership) throw new Error("This group chat is not available.");
  await prisma.messageGroupMember.update({
    where: { groupId_userId: { groupId: membership.groupId, userId: user.id } },
    data: { lastReadAt: new Date() },
  });
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

  const membership = await findMessageGroupMembership(user, parsed.id);
  if (!membership) throw new Error("This group chat is not available.");
  await prisma.messageGroupMember.update({
    where: { groupId_userId: { groupId: membership.groupId, userId: user.id } },
    data: { mutedAt: muted ? new Date() : null },
  });
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

  const candidates = await listCompanyMessagingCandidates(companyId, user.id);
  const allowedIds = new Set(candidates.map((candidate) => candidate.id));
  const memberIds = uniq([...input.memberIds, user.id]);
  if (memberIds.length < 2) {
    throw new Error("Select at least two members for the group chat.");
  }
  if (memberIds.some((id) => !allowedIds.has(id))) {
    throw new Error("One or more selected members are not eligible for this company group.");
  }

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
          lastReadAt: now,
          mutedAt: null,
        })),
      },
    },
    select: { id: true },
  });

  return { threadKey: makeThreadKey("group", group.id) };
}

export async function updateMessageGroup(user: AccessUser, groupId: string, input: { name: string; memberIds: string[] }) {
  const group = await findManagedMessageGroup(user, groupId);
  if (!group) {
    throw new Error("This group chat is not available.");
  }

  const name = normalizeText(input.name);
  if (!name) throw new Error("Group name is required.");

  const candidates = await listCompanyMessagingCandidates(group.company.id, user.id);
  const allowedIds = new Set(candidates.map((candidate) => candidate.id));
  const nextMemberIds = uniq([...input.memberIds, user.id]);
  if (nextMemberIds.length < 2) {
    throw new Error("Select at least two members for the group chat.");
  }
  if (nextMemberIds.some((id) => !allowedIds.has(id))) {
    throw new Error("One or more selected members are not eligible for this company group.");
  }

  const existingMemberIds = new Set(group.members.map((member) => member.userId));
  const toRemove = group.members.map((member) => member.userId).filter((memberId) => !nextMemberIds.includes(memberId));
  const toAdd = nextMemberIds.filter((memberId) => !existingMemberIds.has(memberId));

  await prisma.$transaction([
    prisma.messageGroup.update({
      where: { id: group.id },
      data: { name },
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
              lastReadAt: new Date(),
              mutedAt: null,
            })),
          }),
        ]
      : []),
  ]);

  return { threadKey: makeThreadKey("group", group.id) };
}

export async function deleteMessageGroup(user: AccessUser, groupId: string) {
  const group = await findManagedMessageGroup(user, groupId);
  if (!group) {
    throw new Error("This group chat is not available.");
  }

  await prisma.messageGroup.delete({ where: { id: group.id } });
  return { ok: true };
}

export async function getMessagingUnreadCount(userId: string) {
  const [mutedDirectPreferences, groupMemberships] = await Promise.all([
    prisma.directMessagePreference.findMany({
      where: {
        userId,
        mutedAt: { not: null },
      },
      select: { peerId: true },
    }),
    prisma.messageGroupMember.findMany({
      where: { userId },
      select: { groupId: true, lastReadAt: true, mutedAt: true },
    }),
  ]);

  const mutedPeerIds = mutedDirectPreferences.map((row) => row.peerId);
  const directUnread = await prisma.directMessage.count({
    where: {
      recipientId: userId,
      readAt: null,
      ...(mutedPeerIds.length ? { senderId: { notIn: mutedPeerIds } } : {}),
    },
  });

  const groupCounts = await Promise.all(
    groupMemberships
      .filter((membership) => !membership.mutedAt)
      .map((membership) =>
      prisma.messageGroupMessage.count({
        where: {
          groupId: membership.groupId,
          senderId: { not: userId },
          ...(membership.lastReadAt ? { createdAt: { gt: membership.lastReadAt } } : {}),
        },
      }),
      ),
  );

  return directUnread + groupCounts.reduce((sum, count) => sum + count, 0);
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
