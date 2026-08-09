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

export type JobPayloadMap = {
  [JobType.SEND_EMAIL]: SendEmailPayload;
  [JobType.GENERATE_CSV]: GenerateCsvPayload;
  [JobType.RESIZE_IMAGE]: ResizeImagePayload;
};