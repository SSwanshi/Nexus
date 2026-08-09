import { Worker, Job } from "bullmq";
import { QUEUE_NAME, JobType, prisma, logger } from "@nexus/shared";
import { bullConnection } from "./connection";
import { jobHandlers } from "../jobs/handlers";

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

      await prisma.job.update({
        where: { id: job.id },
        data: { status: "active", attempts: { increment: 1 } },
      });

      await handler(job.data);

      await prisma.job.update({
        where: { id: job.id },
        data: { status: "completed" },
      });

      await prisma.jobLog.create({
        data: { jobId: job.id!, status: "completed", message: "Job finished successfully" },
      });
    },
    {
      connection: bullConnection,
      concurrency: 5, // process up to 5 jobs at once per worker instance
    }
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, type: job.name }, "Job completed");
  });

  worker.on("failed", async (job, err) => {
    logger.error({ jobId: job?.id, type: job?.name, err }, "Job failed");

    if (job) {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: "failed" },
      });
      await prisma.jobLog.create({
        data: { jobId: job.id!, status: "failed", message: err.message },
      });
    }
  });

  return worker;
}