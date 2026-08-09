import express from "express";
import { loadConfig, logger, JobType } from "@nexus/shared";
import { enqueueJob } from "./queue/enqueueJob";

const config = loadConfig();
const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: config.SERVICE_NAME, timestamp: new Date().toISOString() });
});

/**
 * Test endpoint for Day 8 only — proper job APIs (status, cancel) come
 * on Day 11. This just proves jobs can be enqueued end-to-end.
 */
app.post("/test/enqueue-email", async (req, res) => {
  const job = await enqueueJob(JobType.SEND_EMAIL, {
    to: req.body.to ?? "test@example.com",
    subject: req.body.subject ?? "Test email",
    body: req.body.body ?? "This is a test job.",
  });
  res.json({ jobId: job.id, status: job.status });
});

app.listen(config.PORT, () => {
  logger.info(`Scheduler service listening on port ${config.PORT}`);
});