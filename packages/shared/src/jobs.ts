/**
 * Shared between scheduler (producer) and worker (consumer) so both sides
 * agree on job names and payload shapes. This is the "contract" — if you
 * add a new job type, you add it here once, not in two places separately.
 */
export const QUEUE_NAME = "nexus-jobs";

export enum JobType {
  SEND_EMAIL = "send_email",
  GENERATE_CSV = "generate_csv",
  RESIZE_IMAGE = "resize_image",
  // Recurring maintenance job, fired on a schedule by the scheduler's cron
  // (see apps/scheduler/src/queue/cron.ts).
  CLEANUP = "cleanup",
  // TEMPORARY (Phase 3 verification): a job whose handler always throws, used to
  // observe retry + exponential backoff + dead-letter-queue behaviour. Remove
  // this member (and its handler) once retry/DLQ is verified.
  FAIL_TEST = "fail_test",
}

export interface SendEmailPayload {
  to: string;
  subject: string;
  body: string;
}

export interface GenerateCsvPayload {
  reportId: string;
  rows: Record<string, unknown>[];
}

export interface ResizeImagePayload {
  imageUrl: string;
  width: number;
  height: number;
}

export interface CleanupPayload {
  /** Completed jobs older than this many hours are considered stale. */
  olderThanHours: number;
}

export interface FailTestPayload {
  note?: string;
}

export type JobPayloadMap = {
  [JobType.SEND_EMAIL]: SendEmailPayload;
  [JobType.GENERATE_CSV]: GenerateCsvPayload;
  [JobType.RESIZE_IMAGE]: ResizeImagePayload;
  [JobType.CLEANUP]: CleanupPayload;
  [JobType.FAIL_TEST]: FailTestPayload;
};
