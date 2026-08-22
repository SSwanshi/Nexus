import { HttpClient } from "./client";
// Deep import on purpose: `@nexus/shared`'s barrel instantiates a PrismaClient
// at module load. The SDK only needs the job *contract*, and consumers of an SDK
// shouldn't have to generate a Prisma client to enqueue a job.
import { JobType, type JobPayloadMap } from "@nexus/shared/dist/jobs";

/** Every status a job can hold in Postgres. */
export type JobStatus = "queued" | "active" | "completed" | "failed" | "cancelled";

export interface NexusClientOptions {
  /** Base URL of the scheduler service, e.g. `http://localhost:3003`. */
  schedulerUrl: string;
  /** Base URL of the API gateway, e.g. `http://localhost:3001`. */
  gatewayUrl: string;
  /** Optional API key, sent as `X-API-Key` on every request. */
  apiKey?: string;
  /** Transport-failure retries per request. Default 2. */
  retries?: number;
  /** Delay between transport retries, in ms. Default 300. */
  retryDelayMs?: number;
  /** Per-attempt request timeout, in ms. Default 10_000. */
  timeoutMs?: number;
}

export interface EnqueueJobOptions {
  /** Lower number = higher priority. Default 0. */
  priority?: number;
  /** Delay before the job becomes eligible to run, in ms. */
  delayMs?: number;
}

export interface EnqueueJobResult {
  jobId: string;
  type: string;
  status: JobStatus;
  runAt: string | null;
}

export interface JobLogRecord {
  id: string;
  jobId: string;
  status: string;
  message: string | null;
  createdAt: string;
}

export interface JobRecord {
  id: string;
  type: string;
  payload: unknown;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  runAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present on `getJobStatus`, omitted from list results. */
  logs?: JobLogRecord[];
}

export interface ListJobsFilter {
  status?: JobStatus;
  /** 1–100, clamped server-side. Default 20. */
  limit?: number;
  offset?: number;
}

export interface ListJobsResult {
  total: number;
  limit: number;
  offset: number;
  jobs: JobRecord[];
}

export interface CancelJobResult {
  jobId: string;
  status: JobStatus;
}

export interface ServiceInput {
  /** Unique service name. */
  name: string;
  /** Where the gateway forwards matching traffic. */
  baseUrl: string;
  /** Endpoint the gateway can poll for liveness. */
  healthCheckUrl: string;
}

export interface ServiceRecord {
  id: string;
  name: string;
  baseUrl: string;
  healthCheckUrl: string;
  createdAt: string;
}

export interface GatewayHealth {
  status: string;
  service: string;
  timestamp: string;
}

/**
 * Typed client for the Nexus platform.
 *
 * Wraps two services behind one object: the scheduler (jobs) and the gateway
 * (service registry, health, metrics).
 *
 * ```ts
 * const nexus = new NexusClient({
 *   schedulerUrl: "http://localhost:3003",
 *   gatewayUrl: "http://localhost:3001",
 * });
 *
 * const { jobId } = await nexus.enqueueJob(JobType.SEND_EMAIL, {
 *   to: "dev@example.com",
 *   subject: "Welcome",
 *   body: "Thanks for signing up.",
 * });
 * ```
 */
export class NexusClient {
  private readonly scheduler: HttpClient;
  private readonly gateway: HttpClient;

  constructor(options: NexusClientOptions) {
    if (!options?.schedulerUrl) throw new Error("NexusClient requires a schedulerUrl");
    if (!options?.gatewayUrl) throw new Error("NexusClient requires a gatewayUrl");

    const shared = {
      apiKey: options.apiKey,
      retries: options.retries,
      retryDelayMs: options.retryDelayMs,
      timeoutMs: options.timeoutMs,
    };
    this.scheduler = new HttpClient({ baseUrl: options.schedulerUrl, ...shared });
    this.gateway = new HttpClient({ baseUrl: options.gatewayUrl, ...shared });
  }

  /* ----------------------------- Jobs (scheduler) ---------------------------- */

  /**
   * Enqueue a background job.
   *
   * The generic ties `payload` to `type`, so passing a `SendEmailPayload` to a
   * `RESIZE_IMAGE` job is a compile error and editors autocomplete the fields.
   */
  async enqueueJob<T extends JobType>(
    type: T,
    payload: JobPayloadMap[T],
    options?: EnqueueJobOptions
  ): Promise<EnqueueJobResult> {
    return this.scheduler.post<EnqueueJobResult>("/jobs", {
      type,
      payload,
      priority: options?.priority,
      delayMs: options?.delayMs,
    });
  }

  /** Fetch a job with its execution logs. Throws `NexusApiError` (404) if unknown. */
  async getJobStatus(jobId: string): Promise<JobRecord> {
    return this.scheduler.get<JobRecord>(`/jobs/${encodeURIComponent(jobId)}`);
  }

  /** List jobs, newest first, optionally filtered by status. */
  async listJobs(filter?: ListJobsFilter): Promise<ListJobsResult> {
    return this.scheduler.get<ListJobsResult>("/jobs", {
      status: filter?.status,
      limit: filter?.limit,
      offset: filter?.offset,
    });
  }

  /**
   * Cancel a job that hasn't started yet.
   * Throws `NexusApiError` (400) if it's already active or in a terminal state.
   */
  async cancelJob(jobId: string): Promise<CancelJobResult> {
    return this.scheduler.post<CancelJobResult>(`/jobs/${encodeURIComponent(jobId)}/cancel`);
  }

  /* ---------------------------------- Gateway --------------------------------- */

  /** Register a backend service with the gateway. Throws `NexusApiError` (409) if the name is taken. */
  async registerService(service: ServiceInput): Promise<ServiceRecord> {
    return this.gateway.post<ServiceRecord>("/services", service);
  }

  /** Gateway liveness check. */
  async getGatewayHealth(): Promise<GatewayHealth> {
    return this.gateway.get<GatewayHealth>("/health");
  }

  /** Raw Prometheus exposition text — returned unparsed, for scraping or forwarding. */
  async getGatewayMetrics(): Promise<string> {
    return this.gateway.getText("/metrics");
  }
}
