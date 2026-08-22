/**
 * Nexus SDK — basic usage.
 *
 * Enqueues a `send_email` job, then polls until it reaches a terminal state.
 *
 * Run it against a live stack (scheduler + worker + postgres + redis):
 *
 *   pnpm --filter @nexus/shared build
 *   pnpm --filter @nexus/sdk build
 *   pnpm --filter @nexus/sdk exec tsx examples/basic-usage.ts
 *
 * Override the endpoints with NEXUS_SCHEDULER_URL / NEXUS_GATEWAY_URL if your
 * containers are published on different host ports.
 */

// A real consumer writes `from "@nexus/sdk"`; inside the package itself we
// import the source directly so the example runs without a build step.
import { NexusClient, NexusApiError, JobType } from "../src/index";

const TERMINAL = ["completed", "failed", "cancelled"];

const nexus = new NexusClient({
  schedulerUrl: process.env.NEXUS_SCHEDULER_URL ?? "http://localhost:3003",
  gatewayUrl: process.env.NEXUS_GATEWAY_URL ?? "http://localhost:3001",
});

async function main() {
  console.log("→ enqueueing a send_email job…");

  const { jobId, status } = await nexus.enqueueJob(JobType.SEND_EMAIL, {
    to: "dev@example.com",
    subject: "Hello from the Nexus SDK",
    body: "This job was enqueued through @nexus/sdk.",
  });

  console.log(`  enqueued: jobId=${jobId} status=${status}`);
  console.log("→ polling for completion…");

  for (let attempt = 1; attempt <= 30; attempt++) {
    const job = await nexus.getJobStatus(jobId);
    console.log(`  [${String(attempt).padStart(2)}] status=${job.status} attempts=${job.attempts}`);

    if (TERMINAL.includes(job.status)) {
      console.log(`\n→ job reached terminal state: ${job.status}`);
      console.log("  execution log:");
      for (const entry of job.logs ?? []) {
        console.log(`    ${entry.createdAt}  ${entry.status}${entry.message ? `  ${entry.message}` : ""}`);
      }
      if (job.status !== "completed") process.exitCode = 1;
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.error("\n✗ timed out waiting for the job to finish — is the worker running?");
  process.exitCode = 1;
}

main().catch((err) => {
  if (err instanceof NexusApiError) {
    console.error(`✗ Nexus API error (HTTP ${err.status}) at ${err.url}: ${err.message}`);
  } else {
    console.error("✗ Unexpected failure:", err);
  }
  process.exitCode = 1;
});
