import { Router, type RequestHandler } from "express";
import { prisma, logger, JobType, type JobPayloadMap } from "@nexus/shared";
import { jobQueue } from "../queue/queue";
import { enqueueJob } from "../queue/enqueueJob";

/**
 * Express 4 doesn't catch rejected promises from async handlers, so wrap each
 * one — a thrown/rejected error becomes next(err) and hits the app's error
 * middleware instead of hanging the request.
 */
const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

export const jobsRouter: Router = Router();

const VALID_JOB_TYPES = Object.values(JobType) as string[];

/**
 * POST /jobs — the public enqueue endpoint (what the SDK calls).
 *
 * Body: { type, payload, priority?, delayMs? }
 *
 * Payload shape isn't validated per-type here: the worker's handler map is the
 * authority on that, and a bad payload should surface as a failed job with a
 * real error message (visible in JobLog/DLQ) rather than a silent 400. The
 * SDK's generics catch shape mistakes at compile time for TS callers.
 */
jobsRouter.post(
  "/jobs",
  asyncHandler(async (req, res) => {
    const { type, payload, priority, delayMs } = req.body ?? {};

    if (typeof type !== "string" || !VALID_JOB_TYPES.includes(type)) {
      res.status(400).json({
        error: `Invalid job type '${String(type)}'`,
        validTypes: VALID_JOB_TYPES,
      });
      return;
    }

    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      res.status(400).json({ error: "'payload' must be a JSON object" });
      return;
    }

    if (priority !== undefined && !Number.isInteger(priority)) {
      res.status(400).json({ error: "'priority' must be an integer (lower = higher priority)" });
      return;
    }

    if (delayMs !== undefined && (!Number.isFinite(delayMs) || delayMs < 0)) {
      res.status(400).json({ error: "'delayMs' must be a non-negative number" });
      return;
    }

    const jobType = type as JobType;
    const job = await enqueueJob(jobType, payload as JobPayloadMap[typeof jobType], {
      priority,
      delayMs,
    });

    res.status(201).json({ jobId: job.id, type: job.type, status: job.status, runAt: job.runAt });
  })
);

/** GET /jobs/:id — a single job with its execution logs (404 if unknown). */
jobsRouter.get(
  "/jobs/:id",
  asyncHandler(async (req, res) => {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: { logs: { orderBy: { createdAt: "asc" } } },
    });
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(job);
  })
);

/** GET /jobs?status=&limit=&offset= — paginated list, newest first. */
jobsRouter.get(
  "/jobs",
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const where = status ? { status } : {};

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
      prisma.job.count({ where }),
    ]);

    res.json({ total, limit, offset, jobs });
  })
);

/**
 * POST /jobs/:id/cancel — cancel a not-yet-started job.
 * Removes it from BullMQ if it's still waiting/delayed, then marks it
 * "cancelled" in Postgres. 400 if it's already active/completed/failed.
 */
jobsRouter.post(
  "/jobs/:id/cancel",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const dbJob = await prisma.job.findUnique({ where: { id } });
    if (!dbJob) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    // Terminal / in-flight states can't be cancelled.
    if (["active", "completed", "failed", "cancelled"].includes(dbJob.status)) {
      res.status(400).json({ error: `Cannot cancel a job in '${dbJob.status}' state` });
      return;
    }

    const bullJob = await jobQueue.getJob(id);
    if (bullJob) {
      const state = await bullJob.getState();
      if (state === "active") {
        res.status(400).json({ error: "Job has already started and cannot be cancelled" });
        return;
      }
      // waiting / delayed / prioritized → safe to remove before it runs.
      await bullJob.remove();
    }

    const updated = await prisma.job.update({
      where: { id },
      data: { status: "cancelled" },
    });

    logger.info({ jobId: id }, "Job cancelled");
    res.json({ jobId: updated.id, status: updated.status });
  })
);
