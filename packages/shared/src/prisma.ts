import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to initialize PrismaClient.");
}

/**
 * Singleton PrismaClient. Without this guard, every hot-reload in dev
 * (tsx watch) would spin up a new PrismaClient, exhausting Postgres
 * connections. In production this just creates one client at boot.
 */
declare global {
  // eslint-disable-next-line no-var
  var __nexusPrisma: PrismaClient | undefined;
}

export const prisma =
  global.__nexusPrisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__nexusPrisma = prisma;
}