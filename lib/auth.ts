import { getIronSession } from "iron-session";
import type { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { revalidateTag, unstable_cache } from "next/cache";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { AccessUser } from "@/lib/access";
import { isClerkEnabled } from "@/lib/clerk-config";
import { prisma } from "@/lib/prisma";
import type { AppSessionData } from "@/lib/session";
import { sessionOptions } from "@/lib/session";

const userSelect = {
  id: true,
  email: true,
  clerkId: true,
  name: true,
  title: true,
  timezone: true,
  active: true,
  mustChangePassword: true,
  isSuperAdmin: true,
  avatarUrl: true,
  companionIntroCompletedAt: true,
  firstSignInAt: true,
  groupMemberships: {
    select: {
      orgGroupId: true,
      roleDefinitionId: true,
      roleDefinition: { select: { key: true } },
    },
  },
  companyMemberships: {
    select: {
      companyId: true,
      roleDefinitionId: true,
      roleDefinition: { select: { key: true } },
      company: { select: { orgGroupId: true } },
    },
  },
  projectMemberships: {
    select: {
      projectId: true,
      roleDefinitionId: true,
      roleDefinition: { select: { key: true } },
      project: {
        select: {
          id: true,
          companyId: true,
          company: { select: { orgGroupId: true } },
        },
      },
    },
  },
} as const;

const shellUserSelect = {
  id: true,
  name: true,
  avatarUrl: true,
  isSuperAdmin: true,
  groupMemberships: {
    select: {
      roleDefinition: { select: { key: true } },
    },
  },
} as const;

const USER_CACHE_TTL_MS = 30_000;
const ACCESS_USER_CACHE_TAG = "access-user";

type LoadedUser = Prisma.UserGetPayload<{ select: typeof userSelect }> | null;
export type ShellUser = Prisma.UserGetPayload<{ select: typeof shellUserSelect }> | null;
type UserCacheEntry = { user: LoadedUser; expiresAt: number };

const userByIdCache = new Map<string, UserCacheEntry>();
const userByClerkIdCache = new Map<string, UserCacheEntry>();

function readUserCache(cacheMap: Map<string, UserCacheEntry>, key: string) {
  const hit = cacheMap.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cacheMap.delete(key);
    return null;
  }
  return hit.user;
}

function writeUserCache(user: LoadedUser) {
  if (!user) return user;
  const entry = { user, expiresAt: Date.now() + USER_CACHE_TTL_MS };
  userByIdCache.set(user.id, entry);
  if (user.clerkId) userByClerkIdCache.set(user.clerkId, entry);
  return user;
}

function invalidateUserCache(user: { id: string; clerkId?: string | null } | string, clerkId?: string | null) {
  const id = typeof user === "string" ? user : user.id;
  const cid = typeof user === "string" ? clerkId : user.clerkId;
  userByIdCache.delete(id);
  if (cid) userByClerkIdCache.delete(cid);
}

async function loadFreshUserById(id: string) {
  return writeUserCache(
    await prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: userSelect,
    }),
  );
}

export function invalidateAccessUserCache(user: { id: string; clerkId?: string | null } | string, clerkId?: string | null) {
  invalidateUserCache(user, clerkId);
  revalidateTag(ACCESS_USER_CACHE_TAG, "max");
}

const loadAccessUserByIdCached = unstable_cache(
  async (id: string) =>
    prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: userSelect,
    }),
  ["access-user-by-id"],
  { revalidate: 15, tags: [ACCESS_USER_CACHE_TAG] },
);

const loadAccessUserByClerkIdCached = unstable_cache(
  async (clerkId: string) =>
    prisma.user.findFirst({
      where: { clerkId, deletedAt: null },
      select: userSelect,
    }),
  ["access-user-by-clerk-id"],
  { revalidate: 15, tags: [ACCESS_USER_CACHE_TAG] },
);

async function loadUserById(id: string) {
  const cached = readUserCache(userByIdCache, id);
  if (cached !== null) return cached;

  const user = await loadAccessUserByIdCached(id);
  return writeUserCache(user);
}

async function loadUserByClerkId(clerkId: string) {
  const cached = readUserCache(userByClerkIdCache, clerkId);
  if (cached !== null) return cached;

  const user = await loadAccessUserByClerkIdCached(clerkId);
  return writeUserCache(user);
}

const loadShellUserByIdCached = unstable_cache(
  async (id: string) =>
    prisma.user.findFirst({
      where: { id, deletedAt: null, active: true },
      select: shellUserSelect,
    }),
  ["shell-user-by-id"],
  { revalidate: 60 },
);

const loadShellUserByClerkIdCached = unstable_cache(
  async (clerkId: string) =>
    prisma.user.findFirst({
      where: { clerkId, deletedAt: null, active: true },
      select: shellUserSelect,
    }),
  ["shell-user-by-clerk-id"],
  { revalidate: 60 },
);

export async function getAppSession() {
  return getIronSession<AppSessionData>(await cookies(), sessionOptions);
}

async function getCurrentUserImpl() {
  if (isClerkEnabled()) {
    const { auth, currentUser } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    if (!userId) return null;

    let user = await loadUserByClerkId(userId);
    if (!user) {
      const cu = await currentUser();
      const email = cu?.primaryEmailAddress?.emailAddress?.trim().toLowerCase();
      if (email) {
        const byEmail = await prisma.user.findFirst({
          where: { email, deletedAt: null },
          select: userSelect,
        });
        if (byEmail) {
          invalidateAccessUserCache(byEmail);
          await prisma.user.update({ where: { id: byEmail.id }, data: { clerkId: userId } });
          user = await loadUserById(byEmail.id);
        }
      }
    }
    return user;
  }

  const session = await getAppSession();
  if (!session.userId) return null;
  return loadUserById(session.userId);
}

/** Per-request dedupe so layouts and streamed children do not repeat the same Prisma load. */
export const getCurrentUser = cache(getCurrentUserImpl);

/**
 * Lightweight user payload for the app shell. This is safe to cache briefly because
 * it only drives display chrome, not authorization decisions.
 */
export const getCurrentShellUser = cache(async function getCurrentShellUser(): Promise<ShellUser> {
  if (isClerkEnabled()) {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    if (!userId) return null;
    return loadShellUserByClerkIdCached(userId);
  }

  const session = await getAppSession();
  if (!session.userId) return null;
  return loadShellUserByIdCached(session.userId);
});

export async function requireUser(opts?: { skipPasswordResetGate?: boolean }) {
  if (isClerkEnabled()) {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    if (!userId) redirect("/sign-in");
    const user = await getCurrentUser();
    if (!user || !user.active) redirect("/pending-access");
    if (!user.firstSignInAt) {
      invalidateUserCache(user);
      await prisma.user.update({ where: { id: user.id }, data: { firstSignInAt: new Date() } });
      return (await loadFreshUserById(user.id)) as AccessUser;
    }
    return user as AccessUser;
  }

  const user = await getCurrentUser();
  if (!user || !user.active) redirect("/login");
  if (!user.firstSignInAt) {
    invalidateUserCache(user);
    await prisma.user.update({ where: { id: user.id }, data: { firstSignInAt: new Date() } });
    return (await loadFreshUserById(user.id)) as AccessUser;
  }
  if (!opts?.skipPasswordResetGate && user.mustChangePassword) {
    redirect("/settings/change-password");
  }
  return user as AccessUser;
}
