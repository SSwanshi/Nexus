import Redis from "ioredis";
import { loadConfig } from "@nexus/shared";

const config = loadConfig();

export const bullConnection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});