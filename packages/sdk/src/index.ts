export { NexusClient } from "./NexusClient";
export type {
  NexusClientOptions,
  EnqueueJobOptions,
  EnqueueJobResult,
  JobRecord,
  JobLogRecord,
  JobStatus,
  ListJobsFilter,
  ListJobsResult,
  CancelJobResult,
  ServiceInput,
  ServiceRecord,
  GatewayHealth,
} from "./NexusClient";

export { NexusApiError } from "./client";

// Re-exported so consumers get the job contract from one place — no need to
// depend on @nexus/shared just to name a job type or payload.
export { JobType } from "@nexus/shared/dist/jobs";
export type {
  JobPayloadMap,
  SendEmailPayload,
  GenerateCsvPayload,
  ResizeImagePayload,
  CleanupPayload,
} from "@nexus/shared/dist/jobs";
