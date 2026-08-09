import { Queue } from "bullmq";
import { QUEUE_NAME } from "@nexus/shared";
import { bullConnection } from "./connection";

/**
 * The single queue instance the scheduler uses to add jobs. BullMQ handles
 * one Queue per queue name — we're using one shared queue for all job types
 * for now (differentiated by job "name"), rather than a queue per job type.
 * This keeps worker pool sizing simple; splitting into per-type queues is
 * a reasonable future optimization if one job type needs different scaling.
 */
export const jobQueue = new Queue(QUEUE_NAME, {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { age: 3600 }, // keep completed jobs for 1hr, then clean up
    removeOnFail: false, // keep failed jobs around for DLQ inspection
  },
});