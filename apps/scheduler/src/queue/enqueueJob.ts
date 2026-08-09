import { jobQueue } from "./queue";
import { prisma, logger, JobType, JobPayloadMap } from "@nexus/shared";

/**
 * The single entry point for adding work to the system. Writes a row to
 * Postgres (for dashboard visibility / status tracking) AND adds the job
 * to BullMQ (for actual execution). Two systems of record, kept in sync —
 * BullMQ is the execution engine, Postgres is the queryable history.
 */
export async function enqueueJob<T extends JobType>(
  type: T,
  payload: JobPayloadMap[T],
  options?: { priority?: number; delayMs?: number }
) {
  const dbJob = await prisma.job.create({
    data: {
      type,
      payload: payload as any,
      status: "queued",
      priority: options?.priority ?? 0,
      runAt: options?.delayMs ? new Date(Date.now() + options.delayMs) : null,
    },
  });

  await jobQueue.add(type, payload, {
    jobId: dbJob.id, // keep BullMQ's job ID aligned with Postgres's, so we can cross-reference
    priority: options?.priority,
    delay: options?.delayMs,
  });

  logger.info({ jobId: dbJob.id, type }, "Job enqueued");
  return dbJob;
}