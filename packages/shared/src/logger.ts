import pino from "pino";
import { loadConfig } from "./config";

const config = loadConfig();

/**
 * Base logger for the service. Import `createLogger` in each request/job
 * context to attach a correlation/request ID — this is what threads through
 * gateway -> scheduler -> worker -> logs for tracing (Phase 7 hardening).
 */
export const logger = pino({
  name: config.SERVICE_NAME,
  level: config.NODE_ENV === "production" ? "info" : "debug",
  transport:
    config.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

export function createLogger(correlationId: string) {
  return logger.child({ correlationId });
}