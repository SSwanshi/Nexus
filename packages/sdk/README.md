# @nexus/sdk

Typed TypeScript client for the Nexus platform. Wraps the **scheduler** (background jobs) and the **API gateway** (service registry, health, metrics) behind one object.

Zero runtime dependencies — it uses the native `fetch` in Node 18+.

## Install

Inside this monorepo, add it to the consuming workspace package:

```bash
pnpm --filter <your-package> add @nexus/sdk@workspace:*
```

Or add it to that package's `package.json` by hand and run `pnpm install`:

```json
{
  "dependencies": {
    "@nexus/sdk": "workspace:*"
  }
}
```

The SDK ships compiled JavaScript, so build it (and `@nexus/shared`, which holds the job contract) before use:

```bash
pnpm --filter @nexus/shared build && pnpm --filter @nexus/sdk build
```

## Quickstart

```ts
import { NexusClient, NexusApiError, JobType } from "@nexus/sdk";

const nexus = new NexusClient({
  schedulerUrl: "http://localhost:3003",
  gatewayUrl: "http://localhost:3001",
  apiKey: process.env.NEXUS_API_KEY, // optional — sent as X-API-Key
});

// Enqueue a job. The payload type is inferred from the job type, so the
// fields below autocomplete and a wrong shape is a compile error.
const { jobId } = await nexus.enqueueJob(JobType.SEND_EMAIL, {
  to: "dev@example.com",
  subject: "Hello from the Nexus SDK",
  body: "This job was enqueued through @nexus/sdk.",
});

// Poll until it finishes.
while (true) {
  const job = await nexus.getJobStatus(jobId);
  if (["completed", "failed", "cancelled"].includes(job.status)) {
    console.log(job.status, job.logs);
    break;
  }
  await new Promise((r) => setTimeout(r, 1000));
}
```

Errors from a service arrive as `NexusApiError`:

```ts
try {
  await nexus.cancelJob(jobId);
} catch (err) {
  if (err instanceof NexusApiError) {
    console.error(err.status, err.message, err.body);
  }
}
```

A runnable version of the above lives in [`examples/basic-usage.ts`](./examples/basic-usage.ts).

## Methods

| Method | Calls | Returns |
| --- | --- | --- |
| `enqueueJob(type, payload, options?)` | `POST {schedulerUrl}/jobs` | `{ jobId, type, status, runAt }` |
| `getJobStatus(jobId)` | `GET {schedulerUrl}/jobs/:id` | Job record including its execution `logs` |
| `listJobs(filter?)` | `GET {schedulerUrl}/jobs` | `{ total, limit, offset, jobs }`, newest first |
| `cancelJob(jobId)` | `POST {schedulerUrl}/jobs/:id/cancel` | `{ jobId, status: "cancelled" }` |
| `registerService(service)` | `POST {gatewayUrl}/services` | The created service record |
| `getGatewayHealth()` | `GET {gatewayUrl}/health` | `{ status, service, timestamp }` |
| `getGatewayMetrics()` | `GET {gatewayUrl}/metrics` | Raw Prometheus text (unparsed `string`) |

`enqueueJob` options: `priority` (integer, **lower = higher priority**, default `0`) and `delayMs` (defer eligibility).

`listJobs` filter: `status`, `limit` (1–100, clamped server-side, default 20), `offset`.

## Job types

Re-exported from `@nexus/shared`, so you don't need a second dependency:

| `JobType` | Payload |
| --- | --- |
| `SEND_EMAIL` | `{ to, subject, body }` |
| `GENERATE_CSV` | `{ reportId, rows }` |
| `RESIZE_IMAGE` | `{ imageUrl, width, height }` |
| `CLEANUP` | `{ olderThanHours }` — also runs on a cron schedule |

## Configuration

| Option | Default | Purpose |
| --- | --- | --- |
| `schedulerUrl` | — (required) | Scheduler base URL |
| `gatewayUrl` | — (required) | Gateway base URL |
| `apiKey` | — | Sent as `X-API-Key` on every request |
| `retries` | `2` | Retries for **transport** failures only |
| `retryDelayMs` | `300` | Delay between transport retries |
| `timeoutMs` | `10000` | Per-attempt request timeout |

### On retries

Retries apply only to transport failures — connection refused, DNS failure, timeout. A `4xx`/`5xx` means the service was reached and answered, so it is surfaced immediately as a `NexusApiError` rather than repeated: a `400` stays a `400`, and blindly resending a `POST` the server may have partly processed risks duplicate work.

This is separate from **job-level** retries. A job that throws inside the worker is retried by BullMQ (3 attempts, exponential backoff) and lands in the dead-letter queue if every attempt fails.

## Job statuses

`queued` → `active` → `completed` | `failed`, plus `cancelled` for jobs cancelled before they start.
