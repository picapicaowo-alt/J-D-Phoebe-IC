import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { Prisma } from "@prisma/client";
import { staffVisibilityWhere, type AccessUser } from "@/lib/access";
import { resolveBlobReadWriteToken } from "@/lib/blob";
import { prisma } from "@/lib/prisma";

const attachmentSelect = {
  id: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
} as const;

const messageInclude = {
  attachments: { select: attachmentSelect },
  sender: { select: { id: true, name: true, avatarUrl: true } },
  recipient: { select: { id: true, name: true, avatarUrl: true } },
} satisfies Prisma.DirectMessageInclude;

type DirectMessageRow = Prisma.DirectMessageGetPayload<{ include: typeof messageInclude }>;

type VisiblePeerRow = {
  id: string;
  name: string;
  title: string | null;
  avatarUrl: string | null;
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
  body: string | null;
  createdAt: string;
  senderId: string;
  recipientId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  isOwn: boolean;
  attachments: ChatAttachment[];
};

export type ChatPeer = {
  id: string;
  name: string;
  title: string | null;
  avatarUrl: string | null;
  unreadCount: number;
  latestMessageAt: string | null;
  latestMessageText: string | null;
  latestAttachmentCount: number;
  latestMessageFromSelf: boolean;
};

export type ChatPageData = {
  peers: ChatPeer[];
  selectedPeerId: string | null;
  messages: ChatMessage[];
};

function normalizeText(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text || null;
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180) || "file";
}

function conversationWhere(userId: string, peerId: string): Prisma.DirectMessageWhereInput {
  return {
    OR: [
      { senderId: userId, recipientId: peerId },
      { senderId: peerId, recipientId: userId },
    ],
  };
}

function sortPeers(peers: ChatPeer[]) {
  return [...peers].sort((a, b) => {
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

function attachmentUrl(id: string) {
  return `/api/messages/attachments/${id}`;
}

function serializeMessage(row: DirectMessageRow, currentUserId: string): ChatMessage {
  return {
    id: row.id,
    body: normalizeText(row.body),
    createdAt: row.createdAt.toISOString(),
    senderId: row.senderId,
    recipientId: row.recipientId,
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

async function listVisiblePeers(user: AccessUser): Promise<VisiblePeerRow[]> {
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
    select: {
      id: true,
      name: true,
      title: true,
      avatarUrl: true,
    },
  });
}

export async function getConversationMessages(userId: string, peerId: string, limit = 120): Promise<ChatMessage[]> {
  const rows = await prisma.directMessage.findMany({
    where: conversationWhere(userId, peerId),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    include: messageInclude,
  });

  return rows.reverse().map((row) => serializeMessage(row, userId));
}

export async function getDirectMessagesPageData(user: AccessUser, preferredPeerId?: string | null): Promise<ChatPageData> {
  const peers = await listVisiblePeers(user);
  if (!peers.length) {
    return { peers: [], selectedPeerId: null, messages: [] };
  }

  const peerIds = peers.map((peer) => peer.id);
  const unreadGroups =
    peerIds.length > 0
      ? await prisma.directMessage.groupBy({
          by: ["senderId"],
          where: {
            recipientId: user.id,
            readAt: null,
            senderId: { in: peerIds },
          },
          _count: { _all: true },
        })
      : [];

  const latestMessages = await Promise.all(
    peers.map((peer) =>
      prisma.directMessage.findFirst({
        where: conversationWhere(user.id, peer.id),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: messageInclude,
      }),
    ),
  );

  const unreadByPeer = new Map(unreadGroups.map((row) => [row.senderId, row._count._all]));
  const latestByPeer = new Map<string, DirectMessageRow>();

  for (const message of latestMessages) {
    if (!message) continue;
    const peerId = message.senderId === user.id ? message.recipientId : message.senderId;
    latestByPeer.set(peerId, message);
  }

  const summarized = sortPeers(
    peers.map((peer) => {
      const latest = latestByPeer.get(peer.id);
      return {
        id: peer.id,
        name: peer.name,
        title: peer.title,
        avatarUrl: peer.avatarUrl,
        unreadCount: unreadByPeer.get(peer.id) ?? 0,
        latestMessageAt: latest?.createdAt.toISOString() ?? null,
        latestMessageText: latest ? normalizeText(latest.body) : null,
        latestAttachmentCount: latest?.attachments.length ?? 0,
        latestMessageFromSelf: latest ? latest.senderId === user.id : false,
      };
    }),
  );

  const selectedPeerId = summarized.some((peer) => peer.id === preferredPeerId)
    ? String(preferredPeerId)
    : (summarized[0]?.id ?? null);

  const messages = selectedPeerId ? await getConversationMessages(user.id, selectedPeerId) : [];

  return {
    peers: summarized,
    selectedPeerId,
    messages,
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

export async function createDirectMessage(user: AccessUser, peerId: string, body: string, files: File[]) {
  const peer = await findMessagePeer(user, peerId);
  if (!peer) {
    throw new Error("The selected teammate is not available for messaging.");
  }

  const text = normalizeText(body);
  const uploads = files.filter((file) => file.size > 0);

  if (!text && uploads.length === 0) {
    throw new Error("Type a message or attach at least one file.");
  }
  if (uploads.length > 5) {
    throw new Error("You can attach up to 5 files per message.");
  }

  for (const file of uploads) {
    if (file.size > 20 * 1024 * 1024) {
      throw new Error("Each file must be smaller than 20MB.");
    }
  }

  const messageId = randomUUID();
  const attachmentData = [];
  for (const file of uploads) {
    const buf = Buffer.from(await file.arrayBuffer());
    attachmentData.push(await storeMessageFile(buf, file.name || "upload", file.type || "application/octet-stream", messageId));
  }

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
    include: messageInclude,
  });

  return serializeMessage(created, user.id);
}

export async function markConversationRead(user: AccessUser, peerId: string) {
  const peer = await findMessagePeer(user, peerId);
  if (!peer) {
    throw new Error("The selected teammate is not available for messaging.");
  }

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

export async function getRecentMessagesForStream(userId: string, after: Date) {
  const rows = await prisma.directMessage.findMany({
    where: {
      createdAt: { gt: after },
      OR: [{ senderId: userId }, { recipientId: userId }],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 50,
    include: messageInclude,
  });

  return rows.map((row) => serializeMessage(row, userId));
}

export async function findMessageAttachmentForUser(userId: string, attachmentId: string) {
  return prisma.directMessageAttachment.findFirst({
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
}
