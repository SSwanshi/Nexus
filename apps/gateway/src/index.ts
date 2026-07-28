import express from "express";
import { loadConfig, logger } from "@nexus/shared";

const config = loadConfig();
const app = express();

app.use(express.json());

/**
 * Day 1: just a health check so Docker Compose can confirm the gateway
 * boots and reaches Postgres/Redis. Routing, auth, and rate limiting
 * get built out starting Day 5 (Phase 2).
 */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: config.SERVICE_NAME, timestamp: new Date().toISOString() });
});

app.listen(config.PORT, () => {
  logger.info(`Gateway service listening on port ${config.PORT}`);
});