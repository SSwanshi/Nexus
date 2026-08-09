import Redis from "ioredis";
import { loadConfig } from "@nexus/shared";

const config = loadConfig();

/**
 * BullMQ requires this specific option — without it, BullMQ's blocking
 * commands (used internally for job polling) will throw. This connection
 * is separate from any Redis connection the gateway uses for rate limiting,
 * so a burst of job activity never competes with rate-limit checks.
 */
export const bullConnection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});