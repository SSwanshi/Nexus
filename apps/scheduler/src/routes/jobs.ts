import { Router, type RequestHandler } from "express";
import { prisma, logger } from "@nexus/shared";
import { jobQueue } from "../queue/queue";

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
