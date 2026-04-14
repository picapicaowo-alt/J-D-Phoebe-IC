import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AccessUser } from "@/lib/access";
import { isClerkEnabled } from "@/lib/clerk-config";
import { prisma } from "@/lib/prisma";
import type { AppSessionData } from "@/lib/session";
import { sessionOptions } from "@/lib/session";

const userInclude = {
  groupMemberships: { include: { roleDefinition: true, orgGroup: true } },
  companyMemberships: { include: { roleDefinition: true, company: true } },
  projectMemberships: { include: { roleDefinition: true, project: { include: { company: true } } } },
} as const;

async function loadUserById(id: string) {
  return prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: userInclude,
  });
}

export async function getAppSession() {
  return getIronSession<AppSessionData>(await cookies(), sessionOptions);
}

export async function getCurrentUser() {
  if (isClerkEnabled()) {
    const { auth, currentUser } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    if (!userId) return null;

    let user = await prisma.user.findFirst({
      where: { clerkId: userId, deletedAt: null },
      include: userInclude,
    });
    if (!user) {
      const cu = await currentUser();
      const email = cu?.primaryEmailAddress?.emailAddress?.trim().toLowerCase();
      if (email) {
        const byEmail = await prisma.user.findFirst({
          where: { email, deletedAt: null },
          include: userInclude,
        });
        if (byEmail) {
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

export async function requireUser() {
  if (isClerkEnabled()) {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    if (!userId) redirect("/sign-in");
    const user = await getCurrentUser();
    if (!user || !user.active) redirect("/pending-access");
    return user as AccessUser;
  }

  const user = await getCurrentUser();
  if (!user || !user.active) redirect("/login");
  return user as AccessUser;
}
