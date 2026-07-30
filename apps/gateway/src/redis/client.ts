import Redis from "ioredis";
import { loadConfig, logger } from "@nexus/shared";

const config = loadConfig();

/**
 * Single Redis connection reused for rate limiting. Later (Phase 3),
 * the scheduler/worker will use their own Redis connections for BullMQ —
 * kept separate so a rate-limiter slowdown never blocks job processing.
 */
export const redis = new Redis(config.REDIS_URL);

redis.on("error", (err) => {
  logger.error({ err }, "Redis connection error");
});

redis.on("connect", () => {
  logger.info("Connected to Redis");
});