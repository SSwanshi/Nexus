import { Worker, Job } from "bullmq";
import { QUEUE_NAME, JobType, prisma, logger, loadConfig } from "@nexus/shared";
import { bullConnection } from "./connection";
import { jobHandlers } from "../jobs/handlers";

const config = loadConfig();

/**
 * This IS the worker pool. The `concurrency` option controls how many
 * jobs this single worker process handles in parallel — BullMQ pulls
 * the next job off Redis automatically whenever a slot frees up. To
 * scale horizontally, you run multiple instances of this worker process
 * (multiple containers) — they'll all pull from the same queue safely.
 */
export function startWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const handler = jobHandlers[job.name as JobType];
      if (!handler) {
        throw new Error(`No handler registered for job type: ${job.name}`);
      }

      // Upsert (not update): repeatable/cron jobs are created directly by BullMQ's
      // scheduler and never pass through enqueueJob, so they have no pre-existing
      // Postgres row. Upserting keeps every executed job — one-off or recurring —
      // visible to the dashboard, and increments `attempts` on each retry.
      await prisma.job.upsert({
        where: { id: job.id! },
        create: {
          id: job.id!,
          type: job.name,
          payload: (job.data ?? {}) as any,
          status: "active",
          attempts: 1,
          priority: job.opts.priority ?? 0,
        },
        update: { status: "active", attempts: { increment: 1 } },
      });

      await handler(job.data);

      await prisma.job.update({
        where: { id: job.id! },
        data: { status: "completed" },
      });

      await prisma.jobLog.create({
        data: { jobId: job.id!, status: "completed", message: "Job finished successfully" },
      });
    },
    {
      connection: bullConnection,
      concurrency: config.WORKER_CONCURRENCY, // jobs processed in parallel per worker instance
    }
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, type: job.name }, "Job completed");
  });

  worker.on("failed", async (job, err) => {
    logger.error(
      { jobId: job?.id, type: job?.name, attemptsMade: job?.attemptsMade, err },
      "Job failed"
    );
    if (!job) return;

    try {
      // Runs on EVERY failure (intermediate retry OR final): mark failed + log the attempt.
      // updateMany (not update) so a missing row never throws here.
      await prisma.job.updateMany({ where: { id: job.id }, data: { status: "failed" } });
      await prisma.jobLog.create({
        data: { jobId: job.id!, status: "failed", message: err.message },
      });

      // Dead-letter ONLY when retries are exhausted — i.e. this was the final
      // attempt, not an intermediate one that BullMQ will retry.
      const maxAttempts = job.opts.attempts ?? 1;
      if (job.attemptsMade >= maxAttempts) {
        await prisma.dlqEntry.create({
          data: { jobId: job.id!, failureReason: err.message },
        });
        logger.warn(
          { jobId: job.id, attemptsMade: job.attemptsMade, maxAttempts },
          "Job exhausted all retries — moved to dead-letter queue"
        );
      }
    } catch (bookkeepingErr) {
      // Never let bookkeeping errors crash the worker's event loop.
      logger.error({ jobId: job.id, err: bookkeepingErr }, "Failed to record job failure / DLQ entry");
    }
  });

  return worker;
}
