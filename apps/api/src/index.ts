import express from "express";
import { loadConfig, logger } from "@nexus/shared";

const config = loadConfig();
const app = express();

app.use(express.json());

/**
 * Every Nexus service exposes /health so the gateway and Docker Compose
 * healthchecks (and later, the dashboard) can all rely on the same contract.
 */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: config.SERVICE_NAME, timestamp: new Date().toISOString() });
});

app.get("/ping-open", (_req, res) => {
  res.json({ message: "pong: no auth, no rate limit" });
});

app.get("/ping-limited", (_req, res) => {
  res.json({ message: "pong: rate limited route" });
});

app.get("/ping-secure", (_req, res) => {
  res.json({ message: "pong: JWT-protected route" });
});

app.listen(config.PORT, () => {
  logger.info(`API service listening on port ${config.PORT}`);
});