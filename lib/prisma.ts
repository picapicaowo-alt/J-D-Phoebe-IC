import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaCtor: typeof PrismaClient | undefined;
};

/**
 * Single PrismaClient per Node/Vercel instance (avoids connection storms in serverless).
 * `DATABASE_URL` must be a MySQL DSN (mysql://user:pass@host:3306/db).
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
