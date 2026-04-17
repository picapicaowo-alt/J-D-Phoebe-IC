"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { UserFace } from "@/components/user-face";
import { cn } from "@/lib/utils";
import type { ChatMessage, ChatPageData, ChatPeer } from "@/lib/direct-messages";

type Props = {
  locale: "en" | "zh";
  currentUserId: string;
  initialData: ChatPageData;
};

type ApiErrorShape = { error?: string };

function copyFor(locale: "en" | "zh") {
  return locale === "zh"
    ? {
        title: "即时通讯",
        subtitle: "与同事实时收发文本、图片和文件，消息会自动同步到对方屏幕。",
        contacts: "联系人",
        live: "实时同步",
        noPeers: "你当前还没有可聊天的同事。",
        noConversation: "选择一位同事开始聊天。",
        noMessages: "还没有消息，先打个招呼吧。",
        loading: "正在加载对话…",
        placeholder: "输入消息内容…",
        attach: "添加图片或文件",
        clearFiles: "清空附件",
        send: "发送",
        sending: "发送中…",
        uploadHint: "最多 5 个附件，可与文本一起发送。",
        attachmentOne: "1 个附件",
        attachmentMany: (count: number) => `${count} 个附件`,
        noPreview: "还没有消息",
        you: "你",
        openFile: "打开文件",
        remove: "移除",
        titleFallback: "未设置职位",
        sendError: "发送失败，请稍后再试。",
        loadError: "对话加载失败，请稍后再试。",
      }
    : {
        title: "Messaging",
        subtitle: "Chat with teammates in real time and share text, images, and files in one place.",
        contacts: "Contacts",
        live: "Live sync",
        noPeers: "You do not have any available teammates to message yet.",
        noConversation: "Choose a teammate to start chatting.",
        noMessages: "No messages yet. Start the conversation.",
        loading: "Loading conversation…",
        placeholder: "Type your message…",
        attach: "Add image or file",
        clearFiles: "Clear files",
        send: "Send",
        sending: "Sending…",
        uploadHint: "Up to 5 files can be sent together with text.",
        attachmentOne: "1 attachment",
        attachmentMany: (count: number) => `${count} attachments`,
        noPreview: "No messages yet",
        you: "You",
        openFile: "Open file",
        remove: "Remove",
        titleFallback: "No title set",
        sendError: "Could not send the message. Please try again.",
        loadError: "Could not load the conversation. Please try again.",
      };
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
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

function appendMessage(messages: ChatMessage[], incoming: ChatMessage) {
  if (messages.some((message) => message.id === incoming.id)) return messages;
  return [...messages, incoming].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

function previewText(peer: ChatPeer, copy: ReturnType<typeof copyFor>) {
  if (peer.latestMessageText) return peer.latestMessageText;
  if (peer.latestAttachmentCount > 1) return copy.attachmentMany(peer.latestAttachmentCount);
  if (peer.latestAttachmentCount === 1) return copy.attachmentOne;
  return copy.noPreview;
}

function formatSidebarTime(value: string | null, locale: "en" | "zh") {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: locale !== "zh",
  }).format(new Date(value));
}

function formatMessageTime(value: string, locale: "en" | "zh") {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: locale !== "zh",
  }).format(new Date(value));
}

async function readJson<T>(response: Response) {
  const data = (await response.json().catch(() => null)) as T | null;
  return data;
}

export function MessagesPageBody({ locale, currentUserId, initialData }: Props) {
  const copy = copyFor(locale);
  const [peers, setPeers] = useState(initialData.peers);
  const [selectedPeerId, setSelectedPeerId] = useState(initialData.selectedPeerId);
  const [messages, setMessages] = useState(initialData.messages);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedPeerRef = useRef<string | null>(initialData.selectedPeerId);
  const requestRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    selectedPeerRef.current = selectedPeerId;
  }, [selectedPeerId]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [messages, selectedPeerId]);

  const markRead = useEffectEvent(async (peerId: string) => {
    const cleanPeerId = String(peerId ?? "").trim();
    if (!cleanPeerId) return;
    await fetch("/api/messages/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peerId: cleanPeerId }),
    }).catch(() => undefined);
    setPeers((current) =>
      current.map((peer) => (peer.id === cleanPeerId ? { ...peer, unreadCount: 0 } : peer)),
    );
  });

  useEffect(() => {
    if (!selectedPeerId) return;
    const unread = peers.find((peer) => peer.id === selectedPeerId)?.unreadCount ?? 0;
    if (unread > 0) {
      void markRead(selectedPeerId);
    }
  }, [markRead, peers, selectedPeerId]);

  const applyIncomingMessage = useEffectEvent((incoming: ChatMessage) => {
    const peerId = incoming.senderId === currentUserId ? incoming.recipientId : incoming.senderId;
    const isIncoming = incoming.senderId !== currentUserId;

    setPeers((current) => {
      const next = current.map((peer) => {
        if (peer.id !== peerId) return peer;
        const shouldClearUnread = !isIncoming || selectedPeerRef.current === peerId;
        return {
          ...peer,
          latestMessageAt: incoming.createdAt,
          latestMessageText: incoming.body,
          latestAttachmentCount: incoming.attachments.length,
          latestMessageFromSelf: !isIncoming,
          unreadCount: shouldClearUnread ? 0 : peer.unreadCount + 1,
        };
      });
      return sortPeers(next);
    });

    if (selectedPeerRef.current === peerId) {
      setMessages((current) => appendMessage(current, incoming));
      if (isIncoming) {
        void markRead(peerId);
      }
    }
  });

  useEffect(() => {
    const source = new EventSource("/api/messages/stream");

    source.addEventListener("message", (event) => {
      const payload = parseJson<{ message?: ChatMessage }>((event as MessageEvent<string>).data);
      if (payload?.message) {
        applyIncomingMessage(payload.message);
      }
    });

    return () => {
      source.close();
    };
  }, [applyIncomingMessage]);

  async function openConversation(peerId: string) {
    const cleanPeerId = String(peerId ?? "").trim();
    if (!cleanPeerId) return;

    setSelectedPeerId(cleanPeerId);
    setLoadingConversation(true);
    setError(null);

    const requestId = ++requestRef.current;
    try {
      const response = await fetch(`/api/messages?peerId=${encodeURIComponent(cleanPeerId)}`, {
        cache: "no-store",
      });
      const data = await readJson<ChatPageData & ApiErrorShape>(response);
      if (requestId !== requestRef.current) return;
      if (!response.ok || !data) {
        setError(data?.error ?? copy.loadError);
        return;
      }

      setPeers(data.peers);
      setSelectedPeerId(data.selectedPeerId);
      setMessages(data.messages);
      if (data.selectedPeerId) {
        void markRead(data.selectedPeerId);
      }
    } catch {
      if (requestId !== requestRef.current) return;
      setError(copy.loadError);
    } finally {
      if (requestId === requestRef.current) {
        setLoadingConversation(false);
      }
    }
  }

  async function handleSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPeerId || sending) return;

    setSending(true);
    setError(null);

    const formData = new FormData();
    formData.set("peerId", selectedPeerId);
    formData.set("body", draft);
    for (const file of files) {
      formData.append("files", file);
    }

    try {
      const response = await fetch("/api/messages", { method: "POST", body: formData });
      const data = await readJson<{ message?: ChatMessage; error?: string }>(response);
      if (!response.ok || !data?.message) {
        setError(data?.error ?? copy.sendError);
        return;
      }

      setMessages((current) => appendMessage(current, data.message!));
      setPeers((current) =>
        sortPeers(
          current.map((peer) =>
            peer.id === selectedPeerId
              ? {
                  ...peer,
                  latestMessageAt: data.message!.createdAt,
                  latestMessageText: data.message!.body,
                  latestAttachmentCount: data.message!.attachments.length,
                  latestMessageFromSelf: true,
                  unreadCount: 0,
                }
              : peer,
          ),
        ),
      );
      setDraft("");
      setFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch {
      setError(copy.sendError);
    } finally {
      setSending(false);
    }
  }

  const selectedPeer = peers.find((peer) => peer.id === selectedPeerId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-[-0.04em] text-[hsl(var(--foreground))]">{copy.title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--muted))]">{copy.subtitle}</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-700 dark:text-emerald-300">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          {copy.live}
        </div>
      </div>

      {peers.length === 0 ? (
        <Card className="rounded-[24px] border border-[hsl(var(--border))] p-8 text-center">
          <CardTitle className="font-display text-lg">{copy.contacts}</CardTitle>
          <p className="mt-3 text-sm text-[hsl(var(--muted))]">{copy.noPeers}</p>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px,minmax(0,1fr)]">
          <Card className="rounded-[24px] border border-[hsl(var(--border))] p-0">
            <div className="border-b border-[hsl(var(--border))] px-5 py-4">
              <CardTitle className="font-display text-lg">{copy.contacts}</CardTitle>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-3">
              <div className="space-y-2">
                {peers.map((peer) => {
                  const active = peer.id === selectedPeerId;
                  const preview = previewText(peer, copy);
                  return (
                    <button
                      key={peer.id}
                      type="button"
                      onClick={() => void openConversation(peer.id)}
                      className={cn(
                        "w-full rounded-[18px] border px-3 py-3 text-left transition",
                        active
                          ? "border-[hsl(var(--primary))]/35 bg-[hsl(var(--primary))]/10 shadow-[0_10px_24px_rgba(99,102,241,0.14)]"
                          : "border-transparent bg-black/[0.025] hover:border-[hsl(var(--border))] hover:bg-black/[0.045] dark:bg-white/[0.03] dark:hover:bg-white/[0.05]",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <UserFace name={peer.name} avatarUrl={peer.avatarUrl} size={40} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">{peer.name}</p>
                            {peer.latestMessageAt ? (
                              <span className="shrink-0 text-[11px] text-[hsl(var(--muted))]">
                                {formatSidebarTime(peer.latestMessageAt, locale)}
                              </span>
                            ) : null}
                          </div>
                          <p className="truncate text-xs text-[hsl(var(--muted))]">{peer.title || copy.titleFallback}</p>
                          <p className="mt-1 line-clamp-2 text-sm text-[hsl(var(--muted))]">
                            {peer.latestMessageFromSelf && (peer.latestMessageText || peer.latestAttachmentCount > 0) ? `${copy.you}: ` : ""}
                            {preview}
                          </p>
                        </div>
                        {peer.unreadCount > 0 ? (
                          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-[hsl(var(--primary))] px-1.5 py-0.5 text-xs font-semibold text-white">
                            {peer.unreadCount}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card className="rounded-[28px] border border-[hsl(var(--border))] p-0">
            {!selectedPeer ? (
              <div className="flex min-h-[640px] items-center justify-center px-6 text-center text-sm text-[hsl(var(--muted))]">
                {copy.noConversation}
              </div>
            ) : (
              <div className="flex min-h-[640px] flex-col">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[hsl(var(--border))] px-6 py-5">
                  <div className="flex items-center gap-3">
                    <UserFace name={selectedPeer.name} avatarUrl={selectedPeer.avatarUrl} size={44} />
                    <div>
                      <h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-[hsl(var(--foreground))]">{selectedPeer.name}</h2>
                      <p className="text-sm text-[hsl(var(--muted))]">{selectedPeer.title || copy.titleFallback}</p>
                    </div>
                  </div>
                  {loadingConversation ? <p className="text-sm text-[hsl(var(--muted))]">{copy.loading}</p> : null}
                </div>

                <div ref={scrollerRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
                  {messages.length === 0 ? (
                    <div className="flex min-h-[320px] items-center justify-center rounded-[24px] border border-dashed border-[hsl(var(--border))] bg-black/[0.02] px-6 text-center text-sm text-[hsl(var(--muted))] dark:bg-white/[0.02]">
                      {copy.noMessages}
                    </div>
                  ) : (
                    messages.map((message) => (
                      <div key={message.id} className={cn("flex gap-3", message.isOwn ? "justify-end" : "justify-start")}>
                        {!message.isOwn ? <UserFace name={message.senderName} avatarUrl={message.senderAvatarUrl} size={36} className="mt-1" /> : null}
                        <div className={cn("max-w-[min(100%,44rem)]", message.isOwn ? "items-end" : "items-start")}>
                          <div
                            className={cn(
                              "rounded-[22px] border px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)]",
                              message.isOwn
                                ? "border-[hsl(var(--primary))]/25 bg-[hsl(var(--primary))] text-white"
                                : "border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))]",
                            )}
                          >
                            {message.body ? <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p> : null}
                            {message.attachments.length > 0 ? (
                              <div className={cn("grid gap-3", message.body ? "mt-3" : "")}>
                                {message.attachments.map((attachment) =>
                                  attachment.isImage ? (
                                    <a
                                      key={attachment.id}
                                      href={attachment.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="block overflow-hidden rounded-[18px] border border-white/15 bg-black/5"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={attachment.url}
                                        alt={attachment.fileName}
                                        className="max-h-72 w-full object-cover"
                                      />
                                    </a>
                                  ) : (
                                    <a
                                      key={attachment.id}
                                      href={attachment.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={cn(
                                        "flex items-center justify-between gap-3 rounded-[16px] border px-3 py-2 text-sm",
                                        message.isOwn ? "border-white/15 bg-white/10" : "border-[hsl(var(--border))] bg-black/[0.03] dark:bg-white/[0.03]",
                                      )}
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate font-medium">{attachment.fileName}</p>
                                        <p className={cn("text-xs", message.isOwn ? "text-white/75" : "text-[hsl(var(--muted))]")}>
                                          {copy.openFile}
                                        </p>
                                      </div>
                                      <span className={cn("text-xs", message.isOwn ? "text-white/75" : "text-[hsl(var(--muted))]")}>
                                        {Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB
                                      </span>
                                    </a>
                                  ),
                                )}
                              </div>
                            ) : null}
                          </div>
                          <p className="mt-1.5 px-1 text-xs text-[hsl(var(--muted))]">{formatMessageTime(message.createdAt, locale)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="border-t border-[hsl(var(--border))] px-5 py-4">
                  <form onSubmit={handleSend} className="space-y-3">
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder={copy.placeholder}
                      className="min-h-[108px] w-full rounded-[22px] border border-[hsl(var(--border))] bg-transparent px-4 py-3 text-sm text-[hsl(var(--foreground))] outline-none ring-[hsl(var(--ring))]/20 transition focus:ring-2"
                    />

                    {files.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {files.map((file, index) => (
                          <div
                            key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                            className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-black/[0.03] px-3 py-1.5 text-xs text-[hsl(var(--foreground))] dark:bg-white/[0.03]"
                          >
                            <span className="max-w-[14rem] truncate">{file.name}</span>
                            <button
                              type="button"
                              onClick={() => setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                              className="text-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
                            >
                              {copy.remove}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(event) => {
                            const picked = Array.from(event.target.files ?? []);
                            if (!picked.length) return;
                            setFiles((current) => [...current, ...picked].slice(0, 5));
                            event.target.value = "";
                          }}
                        />
                        <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
                          {copy.attach}
                        </Button>
                        {files.length > 0 ? (
                          <Button type="button" variant="ghost" onClick={() => setFiles([])}>
                            {copy.clearFiles}
                          </Button>
                        ) : null}
                        <p className="text-xs text-[hsl(var(--muted))]">{copy.uploadHint}</p>
                      </div>

                      <Button type="submit" disabled={sending || (!draft.trim() && files.length === 0)}>
                        {sending ? copy.sending : copy.send}
                      </Button>
                    </div>

                    {error ? <p className="text-sm text-[hsl(var(--error))]">{error}</p> : null}
                  </form>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
