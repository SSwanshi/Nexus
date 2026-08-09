import { JobType, JobPayloadMap, logger } from "@nexus/shared";

/**
 * One handler function per job type. This is where the "worker pool"
 * concept lives — BullMQ manages a pool of concurrent job executions
 * (configured in worker.ts), and this map is how each job type knows
 * what code to actually run.
 */
export const jobHandlers: {
  [K in JobType]: (payload: JobPayloadMap[K]) => Promise<void>;
} = {
  [JobType.SEND_EMAIL]: async (payload) => {
    logger.info({ to: payload.to, subject: payload.subject }, "Sending email (stub)");
    // Real email-sending integration goes here later (e.g. SES, Resend).
    await new Promise((resolve) => setTimeout(resolve, 500)); // simulate work
  },

  [JobType.GENERATE_CSV]: async (payload) => {
    logger.info({ reportId: payload.reportId, rowCount: payload.rows.length }, "Generating CSV (stub)");
    await new Promise((resolve) => setTimeout(resolve, 500));
  },

  [JobType.RESIZE_IMAGE]: async (payload) => {
    logger.info({ imageUrl: payload.imageUrl }, "Resizing image (stub)");
    await new Promise((resolve) => setTimeout(resolve, 500));
  },
};