"use client";

import Link from "next/link";
import { startTransition, useDeferredValue, useEffect, useEffectEvent, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { UserFace } from "@/components/user-face";
import { cn } from "@/lib/utils";
import type { ChatMessage, ChatPageData, ChatThreadData, ChatThreadDetail, ChatThreadSummary } from "@/lib/direct-messages";

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
        subtitle: "支持私聊和群聊，文本、图片与文件都会实时同步到在线成员屏幕上。",
        threads: "聊天",
        noThreads: "还没有任何聊天。你可以先发起私聊，或者由管理员创建群聊。",
        noConversation: "选择一个聊天开始查看消息。",
        noMessages: "这个聊天还没有消息，先发第一条吧。",
        loading: "正在加载对话…",
        placeholder: "输入消息内容…",
        attach: "添加图片或文件",
        clearFiles: "清空附件",
        send: "发送",
        sending: "发送中…",
        uploadHint: "最多 5 个附件，可和文本一起发送。",
        attachmentOne: "1 个附件",
        attachmentMany: (count: number) => `${count} 个附件`,
        noPreview: "还没有消息",
        you: "你",
        openFile: "打开文件",
        remove: "移除",
        titleFallback: "未设置职位",
        sendError: "发送失败，请稍后再试。",
        loadError: "对话加载失败，请稍后再试。",
        groupLabel: "群聊",
        directLabel: "私聊",
        live: "实时同步",
        newGroup: "新建群聊",
        manageGroup: "管理群聊",
        groupName: "群聊名称",
        groupNamePlaceholder: "例如：Phoebe Consulting Team",
        groupCompany: "所属公司",
        groupPhoto: "群头像",
        groupPhotoHint: "上传 JPG、PNG、WebP 或 GIF 作为群聊头像。",
        groupMembers: "群成员",
        groupMemberHint: "创建人会自动加入。请选择至少一位其他成员。",
        groupAdminHint: "群管理员可以使用 @all、添加或删除成员，并可删除群聊。",
        groupAdminLabel: "管理员",
        groupCreatorLabel: "创建人",
        groupCreate: "创建群聊",
        groupCreating: "创建中…",
        groupSave: "保存修改",
        groupSaving: "保存中…",
        groupDelete: "删除群聊",
        groupDeleteConfirm: "确认删除这个群聊吗？聊天记录和成员关系会一起移除。",
        membersCount: (count: number) => `${count} 人`,
        memberList: "成员列表",
        searchMembers: "搜索成员",
        messageMember: "发消息",
        viewProfile: "查看资料",
        noAdminCompanies: "你当前没有可创建群聊的管理范围。",
        currentUserLocked: "你（自动加入）",
        refreshInfo: "右上角会显示消息未读数。",
        close: "关闭",
        cancel: "取消",
        searchPlaceholder: "搜索联系人或群聊…",
        noSearchResults: "没有匹配的联系人或群聊。",
        mutedLabel: "已静音",
        mute: "静音通知",
        unmute: "恢复通知",
      }
    : {
        title: "Messaging",
        subtitle: "Private chats and group chats now support live text, image, and file delivery.",
        threads: "Chats",
        noThreads: "No chats yet. Start a direct chat or create a group as an admin.",
        noConversation: "Choose a chat to view messages.",
        noMessages: "No messages in this chat yet. Send the first one.",
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
        groupLabel: "Group",
        directLabel: "Direct",
        live: "Live sync",
        newGroup: "New group",
        manageGroup: "Manage group",
        groupName: "Group name",
        groupNamePlaceholder: "Example: Phoebe Consulting Team",
        groupCompany: "Company",
        groupPhoto: "Group photo",
        groupPhotoHint: "Upload a JPG, PNG, WebP, or GIF image for this group chat.",
        groupMembers: "Members",
        groupMemberHint: "The creator is always included. Select at least one more member.",
        groupAdminHint: "Group admins can use @all, add or remove members, and delete the group chat.",
        groupAdminLabel: "Admin",
        groupCreatorLabel: "Creator",
        groupCreate: "Create group",
        groupCreating: "Creating…",
        groupSave: "Save changes",
        groupSaving: "Saving…",
        groupDelete: "Delete group",
        groupDeleteConfirm: "Delete this group chat? Messages and membership will be removed.",
        membersCount: (count: number) => `${count} members`,
        memberList: "Members",
        searchMembers: "Search members",
        messageMember: "Message",
        viewProfile: "View profile",
        noAdminCompanies: "You do not currently manage any companies that can create group chats.",
        currentUserLocked: "You (included)",
        refreshInfo: "Unread totals also appear in the top-right header.",
        close: "Close",
        cancel: "Cancel",
        searchPlaceholder: "Search contacts or groups…",
        noSearchResults: "No matching contacts or groups.",
        mutedLabel: "Muted",
        mute: "Mute notifications",
        unmute: "Unmute notifications",
      };
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
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

function appendMessage(messages: ChatMessage[], incoming: ChatMessage) {
  if (messages.some((message) => message.id === incoming.id)) return messages;
  return [...messages, incoming].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

function threadDetailToSummary(thread: ChatThreadDetail): ChatThreadSummary {
  const { members: _members, creatorId: _creatorId, ...summary } = thread;
  return summary;
}

function summaryToDetail(thread: ChatThreadSummary): ChatThreadDetail {
  return {
    ...thread,
    members: [],
    creatorId: "",
  };
}

function upsertThread(current: ChatThreadSummary[], nextThread: ChatThreadSummary) {
  const existingIndex = current.findIndex((thread) => thread.key === nextThread.key);
  if (existingIndex === -1) {
    return sortThreads([...current, nextThread]);
  }
  return sortThreads(current.map((thread) => (thread.key === nextThread.key ? nextThread : thread)));
}

function previewText(thread: ChatThreadSummary, copy: ReturnType<typeof copyFor>) {
  if (thread.latestMessageText) return thread.latestMessageText;
  if (thread.latestAttachmentCount > 1) return copy.attachmentMany(thread.latestAttachmentCount);
  if (thread.latestAttachmentCount === 1) return copy.attachmentOne;
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

function notifyUnreadChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("messages:unread-changed"));
}

export function MessagesPageBody({ locale, currentUserId, initialData }: Props) {
  const copy = copyFor(locale);
  const [threads, setThreads] = useState(initialData.threads);
  const [selectedThreadKey, setSelectedThreadKey] = useState(initialData.selectedThreadKey);
  const [selectedThread, setSelectedThread] = useState(initialData.selectedThread);
  const [messages, setMessages] = useState(initialData.messages);
  const [groupOptions, setGroupOptions] = useState(initialData.groupOptions);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [groupSaving, setGroupSaving] = useState(false);
  const [createGroupName, setCreateGroupName] = useState("");
  const [createCompanyId, setCreateCompanyId] = useState(initialData.groupOptions[0]?.id ?? "");
  const [createMemberIds, setCreateMemberIds] = useState<string[]>([]);
  const [manageGroupName, setManageGroupName] = useState("");
  const [manageMemberIds, setManageMemberIds] = useState<string[]>([]);
  const [manageAdminIds, setManageAdminIds] = useState<string[]>([]);
  const [manageGroupPhoto, setManageGroupPhoto] = useState<File | null>(null);
  const [memberListQuery, setMemberListQuery] = useState("");
  const [hoveredMemberId, setHoveredMemberId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const threadsRef = useRef(initialData.threads);
  const selectedThreadRef = useRef<string | null>(initialData.selectedThreadKey);
  const threadDataCacheRef = useRef(
    new Map<string, ChatThreadData>(
      initialData.selectedThreadKey && initialData.selectedThread
        ? [[initialData.selectedThreadKey, { thread: initialData.selectedThread, messages: initialData.messages }]]
        : [],
    ),
  );
  const requestRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const createDialogRef = useRef<HTMLDialogElement>(null);
  const manageDialogRef = useRef<HTMLDialogElement>(null);
  const memberListDialogRef = useRef<HTMLDialogElement>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const deferredMemberListQuery = useDeferredValue(memberListQuery);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    selectedThreadRef.current = selectedThreadKey;
  }, [selectedThreadKey]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [messages, selectedThreadKey]);

  useEffect(() => {
    if (!groupOptions.some((option) => option.id === createCompanyId)) {
      setCreateCompanyId(groupOptions[0]?.id ?? "");
      setCreateMemberIds([]);
    }
  }, [createCompanyId, groupOptions]);

  const applyPageData = useEffectEvent((data: ChatPageData) => {
    setThreads(data.threads);
    setSelectedThreadKey(data.selectedThreadKey);
    setSelectedThread(data.selectedThread);
    setMessages(data.messages);
    setGroupOptions(data.groupOptions);
    if (data.selectedThreadKey && data.selectedThread) {
      threadDataCacheRef.current.set(data.selectedThreadKey, {
        thread: data.selectedThread,
        messages: data.messages,
      });
    }
    notifyUnreadChanged();
  });

  const applyThreadData = useEffectEvent((threadKey: string, data: ChatThreadData) => {
    threadDataCacheRef.current.set(threadKey, data);
    startTransition(() => {
      setSelectedThreadKey(threadKey);
      setSelectedThread(data.thread);
      setMessages(data.messages);
    });
  });

  const refreshPage = useEffectEvent(async (threadKey?: string | null, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoadingConversation(true);
    const requestId = ++requestRef.current;

    try {
      const search = threadKey ? `?threadKey=${encodeURIComponent(threadKey)}` : "";
      const response = await fetch(`/api/messages${search}`, { cache: "no-store" });
      const data = await readJson<ChatPageData & ApiErrorShape>(response);
      if (requestId !== requestRef.current) return;
      if (!response.ok || !data) {
        setError(data?.error ?? copy.loadError);
        return;
      }
      applyPageData(data);
      setError(null);
    } catch {
      if (requestId !== requestRef.current) return;
      setError(copy.loadError);
    } finally {
      if (requestId === requestRef.current && !opts?.silent) {
        setLoadingConversation(false);
      }
    }
  });

  const refreshThread = useEffectEvent(async (threadKey: string, opts?: { silent?: boolean }) => {
    const cleanThreadKey = String(threadKey ?? "").trim();
    if (!cleanThreadKey) return;
    if (!opts?.silent) setLoadingConversation(true);
    const requestId = ++requestRef.current;

    try {
      const response = await fetch(`/api/messages/thread?threadKey=${encodeURIComponent(cleanThreadKey)}`, { cache: "no-store" });
      const data = await readJson<ChatThreadData & ApiErrorShape>(response);
      if (requestId !== requestRef.current) return;
      if (!response.ok || !data) {
        setError(data?.error ?? copy.loadError);
        return;
      }
      applyThreadData(cleanThreadKey, data);
      setError(null);
    } catch {
      if (requestId !== requestRef.current) return;
      setError(copy.loadError);
    } finally {
      if (requestId === requestRef.current && !opts?.silent) {
        setLoadingConversation(false);
      }
    }
  });

  const markRead = useEffectEvent(async (threadKey: string) => {
    const cleanThreadKey = String(threadKey ?? "").trim();
    if (!cleanThreadKey) return;
    await fetch("/api/messages/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadKey: cleanThreadKey }),
    }).catch(() => undefined);
    setThreads((current) =>
      current.map((thread) => (thread.key === cleanThreadKey ? { ...thread, unreadCount: 0 } : thread)),
    );
    notifyUnreadChanged();
  });

  useEffect(() => {
    if (!selectedThreadKey) return;
    const unread = threads.find((thread) => thread.key === selectedThreadKey)?.unreadCount ?? 0;
    if (unread > 0) {
      void markRead(selectedThreadKey);
    }
  }, [markRead, selectedThreadKey, threads]);

  const applyIncomingMessage = useEffectEvent((incoming: ChatMessage) => {
    const cachedThread = threadDataCacheRef.current.get(incoming.threadKey);
    if (cachedThread) {
      threadDataCacheRef.current.set(incoming.threadKey, {
        thread: cachedThread.thread,
        messages: appendMessage(cachedThread.messages, incoming),
      });
    }

    let found = false;
    setThreads((current) => {
      const next = current.map((thread) => {
        if (thread.key !== incoming.threadKey) return thread;
        found = true;
        const shouldClearUnread = incoming.isOwn || selectedThreadRef.current === incoming.threadKey;
        return {
          ...thread,
          latestMessageAt: incoming.createdAt,
          latestMessageText: incoming.body,
          latestAttachmentCount: incoming.attachments.length,
          latestMessageFromSelf: incoming.isOwn,
          unreadCount: shouldClearUnread ? 0 : thread.unreadCount + 1,
        };
      });
      return sortThreads(next);
    });

    if (!found) {
      void refreshPage(selectedThreadRef.current ?? incoming.threadKey, { silent: true });
      return;
    }

    if (selectedThreadRef.current === incoming.threadKey) {
      setMessages((current) => appendMessage(current, incoming));
      if (!incoming.isOwn) {
        void markRead(incoming.threadKey);
      }
    } else if (!incoming.isOwn) {
      notifyUnreadChanged();
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

  async function openThread(threadKey: string) {
    const cleanThreadKey = String(threadKey ?? "").trim();
    if (!cleanThreadKey) return;
    setError(null);

    const cached = threadDataCacheRef.current.get(cleanThreadKey);
    if (cached) {
      requestRef.current += 1;
      applyThreadData(cleanThreadKey, cached);
      setLoadingConversation(false);
      return;
    }

    const summary = threadsRef.current.find((thread) => thread.key === cleanThreadKey);
    startTransition(() => {
      setSelectedThreadKey(cleanThreadKey);
      setSelectedThread(summary ? summaryToDetail(summary) : null);
      setMessages([]);
    });
    await refreshThread(cleanThreadKey);
  }

  async function handleSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedThreadKey || sending) return;

    setSending(true);
    setError(null);

    const formData = new FormData();
    formData.set("threadKey", selectedThreadKey);
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

      const cachedThread = threadDataCacheRef.current.get(selectedThreadKey)?.thread;
      setMessages((current) => appendMessage(current, data.message!));
      threadDataCacheRef.current.set(selectedThreadKey, {
        thread: selectedThread ?? cachedThread ?? null,
        messages: appendMessage(threadDataCacheRef.current.get(selectedThreadKey)?.messages ?? [], data.message!),
      });
      setThreads((current) =>
        sortThreads(
          current.map((thread) =>
            thread.key === selectedThreadKey
              ? {
                  ...thread,
                  latestMessageAt: data.message!.createdAt,
                  latestMessageText: data.message!.body,
                  latestAttachmentCount: data.message!.attachments.length,
                  latestMessageFromSelf: true,
                  unreadCount: 0,
                }
              : thread,
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

  function openCreateGroupDialog() {
    if (!groupOptions.length) return;
    setCreateGroupName("");
    setCreateCompanyId(groupOptions[0]!.id);
    setCreateMemberIds([]);
    setGroupError(null);
    if (!createDialogRef.current?.open) {
      createDialogRef.current?.showModal();
    }
  }

  function openManageGroupDialog() {
    if (!selectedThread || selectedThread.type !== "group" || !selectedThread.canManage) return;
    if (loadingConversation && selectedThread.members.length === 0) return;
    setManageGroupName(selectedThread.name);
    setManageMemberIds(
      selectedThread.members
        .filter((member) => member.id !== currentUserId && !member.isCreator)
        .map((member) => member.id),
    );
    setManageAdminIds(selectedThread.members.filter((member) => member.isAdmin && !member.isCreator).map((member) => member.id));
    setManageGroupPhoto(null);
    setGroupError(null);
    if (!manageDialogRef.current?.open) {
      manageDialogRef.current?.showModal();
    }
  }

  function openMemberListDialog() {
    if (!selectedThread || selectedThread.type !== "group") return;
    if (loadingConversation && selectedThread.members.length === 0) return;
    setMemberListQuery("");
    setHoveredMemberId(null);
    if (!memberListDialogRef.current?.open) {
      memberListDialogRef.current?.showModal();
    }
  }

  async function handleCreateGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (groupSaving) return;

    setGroupSaving(true);
    setGroupError(null);
    try {
      const response = await fetch("/api/messages/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: createCompanyId,
          name: createGroupName,
          memberIds: createMemberIds,
        }),
      });
      const data = await readJson<{ thread?: ChatThreadDetail; error?: string }>(response);
      if (!response.ok || !data?.thread) {
        setGroupError(data?.error ?? copy.loadError);
        return;
      }
      createDialogRef.current?.close();
      const nextThread = data.thread;
      setThreads((current) => upsertThread(current, threadDetailToSummary(nextThread)));
      setSelectedThreadKey(nextThread.key);
      setSelectedThread(nextThread);
      setMessages([]);
      threadDataCacheRef.current.set(nextThread.key, { thread: nextThread, messages: [] });
      setError(null);
      notifyUnreadChanged();
    } catch {
      setGroupError(copy.loadError);
    } finally {
      setGroupSaving(false);
    }
  }

  async function handleUpdateGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (groupSaving || !selectedThread || selectedThread.type !== "group") return;

    setGroupSaving(true);
    setGroupError(null);
    try {
      const formData = new FormData();
      formData.set("name", manageGroupName);
      formData.set("memberIds", JSON.stringify(manageMemberIds));
      formData.set("adminIds", JSON.stringify(manageAdminIds));
      if (manageGroupPhoto) {
        formData.set("groupPhoto", manageGroupPhoto);
      }

      const response = await fetch(`/api/messages/groups/${selectedThread.id}`, {
        method: "PATCH",
        body: formData,
      });
      const data = await readJson<{ thread?: ChatThreadDetail; error?: string }>(response);
      if (!response.ok || !data?.thread) {
        setGroupError(data?.error ?? copy.loadError);
        return;
      }
      manageDialogRef.current?.close();
      const nextThread = data.thread;
      setThreads((current) => upsertThread(current, threadDetailToSummary(nextThread)));
      setSelectedThread(nextThread);
      setSelectedThreadKey(nextThread.key);
      const cachedMessages = threadDataCacheRef.current.get(nextThread.key)?.messages ?? messages;
      threadDataCacheRef.current.set(nextThread.key, {
        thread: nextThread,
        messages: cachedMessages,
      });
      setError(null);
      notifyUnreadChanged();
    } catch {
      setGroupError(copy.loadError);
    } finally {
      setGroupSaving(false);
    }
  }

  async function handleDeleteGroup() {
    if (!selectedThread || selectedThread.type !== "group") return;
    if (!window.confirm(copy.groupDeleteConfirm)) return;

    const deletedThreadKey = selectedThread.key;
    setGroupSaving(true);
    setGroupError(null);
    try {
      const response = await fetch(`/api/messages/groups/${selectedThread.id}`, { method: "DELETE" });
      const data = await readJson<{ ok?: boolean; error?: string }>(response);
      if (!response.ok || !data?.ok) {
        setGroupError(data?.error ?? copy.loadError);
        return;
      }
      manageDialogRef.current?.close();
      const remainingThreads = threadsRef.current.filter((thread) => thread.key !== deletedThreadKey);
      const fallbackThread = remainingThreads[0] ?? null;
      setThreads(remainingThreads);
      setSelectedThreadKey(fallbackThread?.key ?? null);
      setSelectedThread(fallbackThread ? summaryToDetail(fallbackThread) : null);
      setMessages([]);
      threadDataCacheRef.current.delete(deletedThreadKey);
      setError(null);
      notifyUnreadChanged();
      if (fallbackThread) {
        const cached = threadDataCacheRef.current.get(fallbackThread.key);
        if (cached) {
          applyThreadData(fallbackThread.key, cached);
        } else {
          void refreshThread(fallbackThread.key, { silent: true });
        }
      }
    } catch {
      setGroupError(copy.loadError);
    } finally {
      setGroupSaving(false);
    }
  }

  async function handleToggleMute(muted: boolean) {
    if (!selectedThread) return;

    setError(null);
    try {
      const response = await fetch("/api/messages/mute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadKey: selectedThread.key,
          muted,
        }),
      });
      const data = await readJson<{ ok?: boolean; error?: string }>(response);
      if (!response.ok || !data?.ok) {
        setError(data?.error ?? copy.loadError);
        return;
      }

      setThreads((current) =>
        current.map((thread) => (thread.key === selectedThread.key ? { ...thread, isMuted: muted } : thread)),
      );
      setSelectedThread((current) => (current && current.key === selectedThread.key ? { ...current, isMuted: muted } : current));
      const cached = threadDataCacheRef.current.get(selectedThread.key);
      if (cached?.thread) {
        threadDataCacheRef.current.set(selectedThread.key, {
          ...cached,
          thread: { ...cached.thread, isMuted: muted },
        });
      }
      notifyUnreadChanged();
    } catch {
      setError(copy.loadError);
    }
  }

  const selectedGroupOption = selectedThread?.type === "group" ? groupOptions.find((option) => option.id === selectedThread.companyId) ?? null : null;
  const selectedMemberById =
    selectedThread?.type === "group" ? new Map(selectedThread.members.map((member) => [member.id, member])) : new Map();
  const manageCandidates =
    selectedThread?.type === "group"
      ? Array.from(
          new Map(
            [...(selectedGroupOption?.members ?? []), ...selectedThread.members].map((member) => [member.id, member]),
          ).values(),
        )
      : [];
  const normalizedMemberListQuery = deferredMemberListQuery.trim().toLowerCase();
  const memberListMembers =
    selectedThread?.type === "group"
      ? selectedThread.members.filter((member) =>
          [member.name, member.title].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedMemberListQuery)),
        )
      : [];
  const createOption = groupOptions.find((option) => option.id === createCompanyId) ?? null;
  const normalizedSearch = deferredSearchQuery.trim().toLowerCase();
  const filteredThreads = normalizedSearch
    ? threads.filter((thread) =>
        [thread.name, thread.subtitle, thread.companyName, thread.latestMessageText]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch)),
      )
    : threads;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-[-0.04em] text-[hsl(var(--foreground))]">{copy.title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--muted))]">{copy.subtitle}</p>
          <p className="mt-2 text-xs text-[hsl(var(--muted))]">{copy.refreshInfo}</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-700 dark:text-emerald-300">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          {copy.live}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px,minmax(0,1fr)]">
        <Card className="rounded-[24px] border border-[hsl(var(--border))] p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-5 py-4">
            <CardTitle className="font-display text-lg">{copy.threads}</CardTitle>
            {groupOptions.length ? (
              <Button type="button" variant="secondary" onClick={openCreateGroupDialog}>
                {copy.newGroup}
              </Button>
            ) : null}
          </div>
          <div className="border-b border-[hsl(var(--border))] px-4 py-3">
            <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={copy.searchPlaceholder} />
          </div>
          <div className="max-h-[72vh] overflow-y-auto p-3">
            {!threads.length ? (
              <div className="space-y-3 rounded-[18px] border border-dashed border-[hsl(var(--border))] px-4 py-5 text-sm text-[hsl(var(--muted))]">
                <p>{copy.noThreads}</p>
                {!groupOptions.length ? <p>{copy.noAdminCompanies}</p> : null}
              </div>
            ) : !filteredThreads.length ? (
              <div className="space-y-3 rounded-[18px] border border-dashed border-[hsl(var(--border))] px-4 py-5 text-sm text-[hsl(var(--muted))]">
                <p>{copy.noSearchResults}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredThreads.map((thread) => {
                  const active = thread.key === selectedThreadKey;
                  const subtitle =
                    thread.type === "group"
                      ? [thread.companyName, thread.memberCount ? copy.membersCount(thread.memberCount) : null].filter(Boolean).join(" · ")
                      : (thread.subtitle || copy.titleFallback);
                  return (
                    <button
                      key={thread.key}
                      type="button"
                      onClick={() => void openThread(thread.key)}
                      className={cn(
                        "w-full rounded-[18px] border px-3 py-3 text-left transition",
                        active
                          ? "border-[hsl(var(--primary))]/35 bg-[hsl(var(--primary))]/10 shadow-[0_10px_24px_rgba(99,102,241,0.14)]"
                          : "border-transparent bg-black/[0.025] hover:border-[hsl(var(--border))] hover:bg-black/[0.045] dark:bg-white/[0.03] dark:hover:bg-white/[0.05]",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <UserFace name={thread.name} avatarUrl={thread.avatarUrl} size={40} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">{thread.name}</p>
                            {thread.latestMessageAt ? (
                              <span className="shrink-0 text-[11px] text-[hsl(var(--muted))]">
                                {formatSidebarTime(thread.latestMessageAt, locale)}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <Badge tone={thread.type === "group" ? "info" : "neutral"}>{thread.type === "group" ? copy.groupLabel : copy.directLabel}</Badge>
                            {thread.isMuted ? <Badge tone="warn">{copy.mutedLabel}</Badge> : null}
                            <p className="truncate text-xs text-[hsl(var(--muted))]">{subtitle}</p>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-[hsl(var(--muted))]">
                            {thread.latestMessageFromSelf && (thread.latestMessageText || thread.latestAttachmentCount > 0) ? `${copy.you}: ` : ""}
                            {previewText(thread, copy)}
                          </p>
                        </div>
                        {thread.unreadCount > 0 ? (
                          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-[hsl(var(--primary))] px-1.5 py-0.5 text-xs font-semibold text-white">
                            {thread.unreadCount}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        <Card className="rounded-[28px] border border-[hsl(var(--border))] p-0">
          {!selectedThread ? (
            <div className="flex min-h-[640px] items-center justify-center px-6 text-center text-sm text-[hsl(var(--muted))]">
              {copy.noConversation}
            </div>
          ) : (
            <div className="flex min-h-[640px] flex-col">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[hsl(var(--border))] px-6 py-5">
                <div className="flex items-start gap-3">
                  <UserFace name={selectedThread.name} avatarUrl={selectedThread.avatarUrl} size={44} />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedThread.type === "direct" ? (
                        <Link
                          href={`/staff/${selectedThread.id}`}
                          prefetch={false}
                          className="font-display text-xl font-semibold tracking-[-0.02em] text-[hsl(var(--foreground))] underline-offset-4 hover:underline"
                        >
                          {selectedThread.name}
                        </Link>
                      ) : (
                        <h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-[hsl(var(--foreground))]">{selectedThread.name}</h2>
                      )}
                      <Badge tone={selectedThread.type === "group" ? "info" : "neutral"}>
                        {selectedThread.type === "group" ? copy.groupLabel : copy.directLabel}
                      </Badge>
                      {selectedThread.isMuted ? <Badge tone="warn">{copy.mutedLabel}</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-[hsl(var(--muted))]">
                      {selectedThread.type === "group"
                        ? [selectedThread.companyName, selectedThread.memberCount ? copy.membersCount(selectedThread.memberCount) : null].filter(Boolean).join(" · ")
                        : (selectedThread.subtitle || copy.titleFallback)}
                    </p>
                    {selectedThread.type === "group" && selectedThread.canMentionAll ? (
                      <p className="mt-1 text-xs text-[hsl(var(--muted))]">{copy.groupAdminHint}</p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {selectedThread.type === "group" ? (
                    <Button type="button" variant="secondary" onClick={openMemberListDialog}>
                      <span className="inline-flex items-center gap-2">
                        <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true">
                          <path d="M6.25 9a2.75 2.75 0 1 0 0-5.5A2.75 2.75 0 0 0 6.25 9Zm7.5 0a2.75 2.75 0 1 0 0-5.5A2.75 2.75 0 0 0 13.75 9ZM3 15.25c0-1.8 1.46-3.25 3.25-3.25h.5c1.79 0 3.25 1.45 3.25 3.25V17H3v-1.75Zm7 1.75v-1.75c0-.84-.22-1.64-.62-2.33.53-.6 1.31-.92 2.12-.92h.5c1.8 0 3.25 1.45 3.25 3.25V17H10Z" />
                        </svg>
                        <span>
                          {copy.memberList} {selectedThread.memberCount ? `(${selectedThread.memberCount})` : ""}
                        </span>
                      </span>
                    </Button>
                  ) : null}
                  <Button type="button" variant="secondary" onClick={() => void handleToggleMute(!selectedThread.isMuted)}>
                    {selectedThread.isMuted ? copy.unmute : copy.mute}
                  </Button>
                  {selectedThread.type === "group" && selectedThread.canManage ? (
                    <Button type="button" variant="secondary" onClick={openManageGroupDialog}>
                      {copy.manageGroup}
                    </Button>
                  ) : null}
                  {loadingConversation ? <p className="text-sm text-[hsl(var(--muted))]">{copy.loading}</p> : null}
                </div>
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
                      <div className={cn("max-w-[min(100%,46rem)]", message.isOwn ? "items-end" : "items-start")}>
                      {!message.isOwn && selectedThread.type === "group" ? (
                          <Link
                            href={`/staff/${message.senderId}`}
                            prefetch={false}
                            className="mb-1 inline-block px-1 text-xs font-semibold text-[hsl(var(--muted))] underline-offset-4 hover:underline"
                          >
                            {message.senderName}
                          </Link>
                        ) : null}
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
                                    <img src={attachment.url} alt={attachment.fileName} className="max-h-72 w-full object-cover" />
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

      <dialog
        ref={createDialogRef}
        className="app-modal-dialog z-50 w-[min(100vw-2rem,560px)] overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0 shadow-2xl backdrop:bg-black/40"
        onClick={(event) => {
          if (event.target === event.currentTarget) createDialogRef.current?.close();
        }}
      >
        <form onSubmit={handleCreateGroup} className="flex max-h-[min(calc(100dvh-1rem),720px)] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-[hsl(var(--border))] px-6 py-5">
            <div>
              <h3 className="font-display text-xl font-semibold text-[hsl(var(--foreground))]">{copy.newGroup}</h3>
              <p className="mt-1 text-sm text-[hsl(var(--muted))]">{copy.groupMemberHint}</p>
            </div>
            <Button type="button" variant="ghost" onClick={() => createDialogRef.current?.close()}>
              {copy.close}
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {!groupOptions.length ? (
              <p className="text-sm text-[hsl(var(--muted))]">{copy.noAdminCompanies}</p>
            ) : (
              <div className="space-y-5">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-[hsl(var(--foreground))]">{copy.groupName}</span>
                  <Input value={createGroupName} onChange={(event) => setCreateGroupName(event.target.value)} placeholder={copy.groupNamePlaceholder} />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-[hsl(var(--foreground))]">{copy.groupCompany}</span>
                  <Select
                    value={createCompanyId}
                    onChange={(event) => {
                      setCreateCompanyId(event.target.value);
                      setCreateMemberIds([]);
                    }}
                  >
                    {groupOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </Select>
                </label>

                <div className="space-y-2">
                  <span className="text-sm font-medium text-[hsl(var(--foreground))]">{copy.groupMembers}</span>
                  <div className="rounded-[18px] border border-[hsl(var(--border))] p-3">
                    <div className="mb-3 rounded-[14px] border border-dashed border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--muted))]">
                      {copy.currentUserLocked}
                    </div>
                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                      {createOption?.members
                        .filter((member) => member.id !== currentUserId)
                        .map((member) => {
                          const checked = createMemberIds.includes(member.id);
                          return (
                            <label
                              key={member.id}
                              className="flex cursor-pointer items-center justify-between gap-3 rounded-[14px] border border-[hsl(var(--border))] px-3 py-2"
                            >
                              <span className="flex min-w-0 items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) =>
                                    setCreateMemberIds((current) =>
                                      event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id),
                                    )
                                  }
                                />
                                <UserFace name={member.name} avatarUrl={member.avatarUrl} size={28} />
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium text-[hsl(var(--foreground))]">{member.name}</span>
                                  <span className="block truncate text-xs text-[hsl(var(--muted))]">{member.title || copy.titleFallback}</span>
                                </span>
                              </span>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {groupError ? <p className="mt-5 text-sm text-[hsl(var(--error))]">{groupError}</p> : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] px-6 py-4">
            <Button type="button" variant="ghost" onClick={() => createDialogRef.current?.close()}>
              {copy.cancel}
            </Button>
            <Button type="submit" disabled={groupSaving || !groupOptions.length}>
              {groupSaving ? copy.groupCreating : copy.groupCreate}
            </Button>
          </div>
        </form>
      </dialog>

      <dialog
        ref={manageDialogRef}
        className="app-modal-dialog z-50 w-[min(100vw-2rem,560px)] overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0 shadow-2xl backdrop:bg-black/40"
        onClick={(event) => {
          if (event.target === event.currentTarget) manageDialogRef.current?.close();
        }}
      >
        <form onSubmit={handleUpdateGroup} className="flex max-h-[min(calc(100dvh-1rem),720px)] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-[hsl(var(--border))] px-6 py-5">
            <div>
              <h3 className="font-display text-xl font-semibold text-[hsl(var(--foreground))]">{copy.manageGroup}</h3>
              <p className="mt-1 text-sm text-[hsl(var(--muted))]">{copy.groupMemberHint}</p>
            </div>
            <Button type="button" variant="ghost" onClick={() => manageDialogRef.current?.close()}>
              {copy.close}
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="space-y-5">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-[hsl(var(--foreground))]">{copy.groupName}</span>
                <Input value={manageGroupName} onChange={(event) => setManageGroupName(event.target.value)} placeholder={copy.groupNamePlaceholder} />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-[hsl(var(--foreground))]">{copy.groupPhoto}</span>
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(event) => setManageGroupPhoto(event.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-[hsl(var(--muted))]">{copy.groupPhotoHint}</p>
              </label>

              <div className="space-y-2">
                <span className="text-sm font-medium text-[hsl(var(--foreground))]">{copy.groupMembers}</span>
                <div className="rounded-[18px] border border-[hsl(var(--border))] p-3">
                  <div className="mb-3 rounded-[14px] border border-dashed border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--muted))]">
                    {copy.groupAdminHint}
                  </div>
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {manageCandidates.map((member) => {
                        const currentGroupMember = selectedMemberById.get(member.id);
                        const checked = member.id === currentUserId || !!currentGroupMember || manageMemberIds.includes(member.id);
                        const locked = member.id === currentUserId || currentGroupMember?.isCreator;
                        const adminChecked = currentGroupMember?.isCreator || manageAdminIds.includes(member.id);
                        return (
                          <div
                            key={member.id}
                            className="rounded-[14px] border border-[hsl(var(--border))] px-3 py-2"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <label className="flex min-w-0 cursor-pointer items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={locked}
                                  onChange={(event) => {
                                    const isChecked = event.target.checked;
                                    setManageMemberIds((current) =>
                                      isChecked ? [...current, member.id] : current.filter((id) => id !== member.id),
                                    );
                                    if (!isChecked) {
                                      setManageAdminIds((current) => current.filter((id) => id !== member.id));
                                    }
                                  }}
                                />
                                <UserFace name={member.name} avatarUrl={member.avatarUrl} size={28} />
                                <span className="min-w-0">
                                  <span className="flex flex-wrap items-center gap-2">
                                    <span className="block truncate text-sm font-medium text-[hsl(var(--foreground))]">{member.name}</span>
                                    {currentGroupMember?.isCreator ? <Badge tone="neutral">{copy.groupCreatorLabel}</Badge> : null}
                                    {!currentGroupMember?.isCreator && adminChecked ? <Badge tone="info">{copy.groupAdminLabel}</Badge> : null}
                                  </span>
                                  <span className="block truncate text-xs text-[hsl(var(--muted))]">{member.title || copy.titleFallback}</span>
                                </span>
                              </label>
                              <label className="flex shrink-0 items-center gap-2 text-xs text-[hsl(var(--muted))]">
                                <input
                                  type="checkbox"
                                  checked={adminChecked}
                                  disabled={!checked || currentGroupMember?.isCreator}
                                  onChange={(event) =>
                                    setManageAdminIds((current) =>
                                      event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id),
                                    )
                                  }
                                />
                                <span>{copy.groupAdminLabel}</span>
                              </label>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>

            {groupError ? <p className="mt-5 text-sm text-[hsl(var(--error))]">{groupError}</p> : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[hsl(var(--border))] px-6 py-4">
            <Button type="button" variant="ghost" className="text-rose-600 hover:text-rose-700" onClick={() => void handleDeleteGroup()}>
              {copy.groupDelete}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => manageDialogRef.current?.close()}>
                {copy.cancel}
              </Button>
              <Button type="submit" disabled={groupSaving}>
                {groupSaving ? copy.groupSaving : copy.groupSave}
              </Button>
            </div>
          </div>
        </form>
      </dialog>

      <dialog
        ref={memberListDialogRef}
        className="app-modal-dialog z-50 w-[min(100vw-2rem,420px)] overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0 shadow-2xl backdrop:bg-black/40"
        onClick={(event) => {
          if (event.target === event.currentTarget) memberListDialogRef.current?.close();
        }}
      >
        <div className="flex max-h-[min(calc(100dvh-1rem),720px)] flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-[hsl(var(--border))] px-5 py-4">
            <h3 className="font-display text-xl font-semibold text-[hsl(var(--foreground))]">
              {copy.memberList} {selectedThread?.type === "group" && selectedThread.memberCount ? `(${selectedThread.memberCount})` : ""}
            </h3>
            <Button type="button" variant="ghost" onClick={() => memberListDialogRef.current?.close()}>
              {copy.close}
            </Button>
          </div>

          <div className="border-b border-[hsl(var(--border))] px-5 py-4">
            <Input value={memberListQuery} onChange={(event) => setMemberListQuery(event.target.value)} placeholder={copy.searchMembers} />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-2">
              {memberListMembers.map((member) => (
                <div
                  key={member.id}
                  className="relative rounded-[18px] border border-[hsl(var(--border))] px-3 py-3"
                  onMouseEnter={() => setHoveredMemberId(member.id)}
                  onMouseLeave={() => setHoveredMemberId((current) => (current === member.id ? null : current))}
                >
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/staff/${member.id}`} prefetch={false} className="flex min-w-0 items-center gap-3">
                      <UserFace name={member.name} avatarUrl={member.avatarUrl} size={36} />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="block truncate text-sm font-medium text-[hsl(var(--foreground))]">{member.name}</span>
                          {member.isCreator ? <Badge tone="neutral">{copy.groupCreatorLabel}</Badge> : null}
                          {!member.isCreator && member.isAdmin ? <Badge tone="info">{copy.groupAdminLabel}</Badge> : null}
                        </span>
                        <span className="block truncate text-xs text-[hsl(var(--muted))]">{member.title || copy.titleFallback}</span>
                      </span>
                    </Link>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        memberListDialogRef.current?.close();
                        void openThread(`direct:${member.id}`);
                      }}
                    >
                      {copy.messageMember}
                    </Button>
                  </div>

                  {hoveredMemberId === member.id ? (
                    <div className="absolute right-3 top-[calc(100%+0.5rem)] z-10 w-64 rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
                      <div className="flex items-center gap-3">
                        <UserFace name={member.name} avatarUrl={member.avatarUrl} size={52} />
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-[hsl(var(--foreground))]">{member.name}</p>
                          <p className="truncate text-sm text-[hsl(var(--muted))]">{member.title || copy.titleFallback}</p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            memberListDialogRef.current?.close();
                            void openThread(`direct:${member.id}`);
                          }}
                        >
                          {copy.messageMember}
                        </Button>
                        <Link href={`/staff/${member.id}`} prefetch={false} className="text-sm font-medium text-[hsl(var(--primary))]">
                          {copy.viewProfile}
                        </Link>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
}
