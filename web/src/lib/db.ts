/**
 * Prisma client singleton.
 *
 * Prisma 7 requires a driver adapter; we use `@prisma/adapter-pg` reading
 * the connection string from `DATABASE_URL`. The instance is cached on
 * `globalThis` in dev to survive Next.js hot-reloads (avoids exhausting
 * connections).
 *
 * The generated client lives in `src/generated/prisma` (see schema.prisma).
 *
 * NOTE: the stub API routes do NOT import this yet (the build stays
 * DB-free). Downstream agents import `db` here when wiring real queries.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}

export const db: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
