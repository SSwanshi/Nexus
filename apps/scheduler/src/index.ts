import express, { type NextFunction, type Request, type Response } from "express";
import { loadConfig, logger, JobType } from "@nexus/shared";
import { enqueueJob } from "./queue/enqueueJob";
import { registerCronJobs } from "./queue/cron";
import { jobsRouter } from "./routes/jobs";

const config = loadConfig();
const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: config.SERVICE_NAME, timestamp: new Date().toISOString() });
});

// Job status / list / cancel APIs.
app.use(jobsRouter);

/* -------------------------------------------------------------------------- */
/* TEMPORARY test endpoints (Phase 3 verification) — remove before release.   */
/* -------------------------------------------------------------------------- */

app.post("/test/enqueue-email", async (req, res) => {
  const job = await enqueueJob(
    JobType.SEND_EMAIL,
    {
      to: req.body.to ?? "test@example.com",
      subject: req.body.subject ?? "Test email",
      body: req.body.body ?? "This is a test job.",
    },
    req.body.delayMs ? { delayMs: Number(req.body.delayMs) } : undefined
  );
  res.json({ jobId: job.id, status: job.status });
});

// Enqueue a job that always fails → observe 3 attempts w/ exponential backoff → DLQ.
app.post("/test/enqueue-fail", async (req, res) => {
  const job = await enqueueJob(JobType.FAIL_TEST, { note: req.body?.note ?? "retry/DLQ verification" });
  res.json({ jobId: job.id, status: job.status });
});

// Enqueue 3 jobs that all become ready at the SAME instant (shared absolute
// delay), so processing order is decided purely by priority, not arrival time.
// Lower priority number = higher priority. Best observed with WORKER_CONCURRENCY=1
// so the worker pulls strictly one at a time.
app.post("/test/enqueue-priority", async (_req, res) => {
  const readyAt = Date.now() + 2000;
  const lowA = await enqueueJob(
    JobType.SEND_EMAIL,
    { to: "low-a@example.com", subject: "low-A", body: "low priority (enqueued 1st)" },
    { priority: 10, delayMs: readyAt - Date.now() }
  );
  const lowB = await enqueueJob(
    JobType.SEND_EMAIL,
    { to: "low-b@example.com", subject: "low-B", body: "low priority (enqueued 2nd)" },
    { priority: 10, delayMs: readyAt - Date.now() }
  );
  const high = await enqueueJob(
    JobType.SEND_EMAIL,
    { to: "high@example.com", subject: "HIGH", body: "high priority (enqueued last)" },
    { priority: 1, delayMs: readyAt - Date.now() }
  );
  res.json({
    enqueued: { lowA: lowA.id, lowB: lowB.id, high: high.id },
    expectation: "HIGH (priority 1) is processed before the low-priority jobs despite being enqueued last",
  });
});

/* -------------------------------------------------------------------------- */

// Async-error middleware (must be last, 4-arg signature).
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error in scheduler request");
  res.status(500).json({ error: "Internal server error" });
});

app.listen(config.PORT, async () => {
  logger.info(`Scheduler service listening on port ${config.PORT}`);
  try {
    await registerCronJobs();
  } catch (err) {
    logger.error({ err }, "Failed to register cron jobs");
  }
});
