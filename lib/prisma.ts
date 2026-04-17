import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaCtor: typeof PrismaClient | undefined;
};

/**
 * Single PrismaClient per Node/Vercel instance (avoids connection storms in serverless).
 * Point `DATABASE_URL` at Supabase Transaction pooler (:6543) with `?pgbouncer=true`; use `DIRECT_URL` for migrations.
 */
const hasCompatibleClient = globalForPrisma.prisma && globalForPrisma.prismaCtor === PrismaClient;
if (globalForPrisma.prisma && !hasCompatibleClient) {
  void globalForPrisma.prisma.$disconnect().catch(() => undefined);
}

export const prisma =
  (hasCompatibleClient ? globalForPrisma.prisma : undefined) ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaCtor = PrismaClient;
}
