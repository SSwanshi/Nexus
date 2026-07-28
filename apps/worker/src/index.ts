import express from "express";
import { loadConfig, logger } from "@nexus/shared";

const config = loadConfig();
const app = express();

/**
 * Day 1: the worker doesn't consume jobs yet (BullMQ setup starts Day 8,
 * Phase 3). It still runs a tiny HTTP server just for /health, so Docker
 * Compose and the future dashboard have a consistent way to check it's alive.
 */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: config.SERVICE_NAME, timestamp: new Date().toISOString() });
});

app.listen(config.PORT, () => {
  logger.info(`Worker service listening on port ${config.PORT}`);
});