import { z } from "zod";
import "dotenv/config";

/**
 * Every service imports `loadConfig()` at boot. If required env vars are
 * missing or malformed, the process fails fast instead of crashing later
 * mid-request — this is part of the "production hardening" story.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  SERVICE_NAME: z.string().default("nexus-service"),
  // Worker pool size — how many jobs one worker process runs in parallel.
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
});

export type AppConfig = z.infer<typeof envSchema>;

let cachedConfig: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("❌ Invalid environment configuration:");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }

  cachedConfig = parsed.data;
  return cachedConfig;
}