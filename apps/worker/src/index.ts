import express from "express";
import { loadConfig, logger } from "@nexus/shared";
import { startWorker } from "./queue/worker";

const config = loadConfig();
const app = express();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: config.SERVICE_NAME, timestamp: new Date().toISOString() });
});

const worker = startWorker();

app.listen(config.PORT, () => {
  logger.info(`Worker service listening on port ${config.PORT}`);
  logger.info({ concurrency: config.WORKER_CONCURRENCY }, "Worker pool started");
});

process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, closing worker gracefully");
  await worker.close();
  process.exit(0);
});