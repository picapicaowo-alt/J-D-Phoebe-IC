import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

/**
 * Single PrismaClient per Node/Vercel instance (avoids connection storms in serverless).
 * Point `DATABASE_URL` at Supabase Transaction pooler (:6543) with `?pgbouncer=true`; use `DIRECT_URL` for migrations.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
