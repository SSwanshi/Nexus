import { JobType, JobPayloadMap, prisma, logger } from "@nexus/shared";

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

  /**
   * Fired on a schedule by the scheduler's cron (every 5 min). For the demo this
   * just reports how many completed jobs are older than the cutoff — a real
   * implementation would prune them (which needs an ON DELETE CASCADE on the
   * JobLog/DlqEntry FKs first, so we only count for now).
   */
  [JobType.CLEANUP]: async (payload) => {
    const cutoff = new Date(Date.now() - payload.olderThanHours * 60 * 60 * 1000);
    const staleCompleted = await prisma.job.count({
      where: { status: "completed", updatedAt: { lt: cutoff } },
    });
    logger.info(
      { olderThanHours: payload.olderThanHours, staleCompleted },
      "Cleanup cron tick — completed jobs past cutoff (stub, no deletion yet)"
    );
  },

  /**
   * TEMPORARY (Phase 3 verification only): always throws, so we can watch the
   * retry / exponential-backoff / DLQ path end-to-end. Remove this alongside
   * JobType.FAIL_TEST once verified.
   */
  [JobType.FAIL_TEST]: async (payload) => {
    logger.warn({ note: payload.note }, "FAIL_TEST handler invoked — throwing on purpose (test-only)");
    throw new Error("FAIL_TEST: intentional failure to exercise retry + DLQ");
  },
};
