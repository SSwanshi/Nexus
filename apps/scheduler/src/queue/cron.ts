import { jobQueue } from "./queue";
import { JobType, logger, type CleanupPayload } from "@nexus/shared";

/**
 * Registers all recurring (cron) jobs on the shared queue.
 *
 * Uses BullMQ's Job Scheduler API (`upsertJobScheduler`) rather than a raw
 * `repeat` on `queue.add`: upsert is keyed by scheduler id, so restarting the
 * scheduler re-declares the same schedule idempotently instead of piling up
 * duplicate repeatable entries in Redis.
 */
const CLEANUP_SCHEDULER_ID = "cleanup-scheduler";
const CLEANUP_PATTERN = "*/5 * * * *"; // every 5 minutes

export async function registerCronJobs(): Promise<void> {
  await jobQueue.upsertJobScheduler(
    CLEANUP_SCHEDULER_ID,
    { pattern: CLEANUP_PATTERN },
    {
      name: JobType.CLEANUP, // worker routes on job.name → CLEANUP handler
      data: { olderThanHours: 24 } satisfies CleanupPayload,
    }
  );

  logger.info(
    { schedulerId: CLEANUP_SCHEDULER_ID, pattern: CLEANUP_PATTERN },
    "Registered recurring cron jobs"
  );
}
