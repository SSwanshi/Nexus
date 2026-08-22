/**
 * Internal HTTP plumbing for the Nexus SDK.
 *
 * Deliberately dependency-free: Node 18+ ships a global `fetch`, so the SDK
 * stays install-light for consumers instead of pulling in axios/node-fetch.
 */

/** Thrown when a Nexus service returns a non-2xx response. */
export class NexusApiError extends Error {
  /** HTTP status code returned by the service. */
  readonly status: number;
  /** Parsed response body, when the service sent one (usually `{ error: "..." }`). */
  readonly body: unknown;
  /** The URL that produced the error, useful when several services are in play. */
  readonly url: string;

  constructor(message: string, status: number, url: string, body?: unknown) {
    super(message);
    this.name = "NexusApiError";
    this.status = status;
    this.url = url;
    this.body = body;
    // Restores the prototype chain so `err instanceof NexusApiError` holds even
    // when the SDK is consumed as downlevelled CommonJS.
    Object.setPrototypeOf(this, NexusApiError.prototype);
  }
}

export interface HttpClientOptions {
  /** Base URL of the target service, e.g. `http://localhost:3003`. */
  baseUrl: string;
  /** Sent as the `X-API-Key` header when provided. */
  apiKey?: string;
  /** Retries for *transport* failures only. Default 2 (so 3 attempts total). */
  retries?: number;
  /** Delay between transport retries, in ms. Default 300. */
  retryDelayMs?: number;
  /** Per-attempt request timeout, in ms. Default 10_000. */
  timeoutMs?: number;
}

interface RequestOptions {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** `"json"` parses the response; `"text"` returns it verbatim (used for Prometheus metrics). */
  expect?: "json" | "text";
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly retries: number;
  private readonly retryDelayMs: number;
  private readonly timeoutMs: number;

  constructor(options: HttpClientOptions) {
    if (!options.baseUrl) {
      throw new Error("HttpClient requires a baseUrl");
    }
    // Trailing slash would produce `//jobs` when joined with a leading-slash path.
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.retries = options.retries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 300;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  get<T>(path: string, query?: RequestOptions["query"]): Promise<T> {
    return this.request<T>({ method: "GET", path, query });
  }

  getText(path: string): Promise<string> {
    return this.request<string>({ method: "GET", path, expect: "text" });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: "POST", path, body });
  }

  /**
   * Single place where every request is built, sent, retried and error-mapped.
   *
   * Retries cover *transport* failures only — a connection refused, a DNS
   * failure, a timeout. A 4xx/5xx means the service was reached and answered,
   * so retrying it would be wrong (a 400 stays a 400, and blindly repeating a
   * POST that the server may have partly processed risks duplicate work).
   */
  private async request<T>({ method, path, query, body, expect = "json" }: RequestOptions): Promise<T> {
    const url = this.buildUrl(path, query);

    const headers: Record<string, string> = { Accept: expect === "text" ? "text/plain" : "application/json" };
    if (this.apiKey) headers["X-API-Key"] = this.apiKey;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let lastTransportError: unknown;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (err) {
        lastTransportError = err;
        if (attempt < this.retries) {
          await sleep(this.retryDelayMs);
          continue;
        }
        throw new Error(
          `Nexus request failed: ${method} ${url} — ${describe(err)} (after ${attempt + 1} attempt(s))`,
          { cause: err }
        );
      }

      if (!response.ok) {
        throw await toApiError(response, url);
      }

      if (expect === "text") {
        return (await response.text()) as T;
      }
      return (await parseJsonBody(response)) as T;
    }

    // Unreachable: the loop either returns or throws. Kept for exhaustiveness.
    throw new Error(`Nexus request failed: ${method} ${url} — ${describe(lastTransportError)}`);
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const url = new URL(`${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }
}

/** Turns a non-2xx response into a NexusApiError, preferring the service's own error message. */
async function toApiError(response: Response, url: string): Promise<NexusApiError> {
  const raw = await response.text().catch(() => "");
  let body: unknown = raw || undefined;
  let message = response.statusText || `HTTP ${response.status}`;

  if (raw) {
    try {
      body = JSON.parse(raw);
      const parsed = body as Record<string, unknown>;
      const detail = parsed?.error ?? parsed?.message;
      if (typeof detail === "string" && detail) message = detail;
    } catch {
      // Not JSON (an HTML error page, a proxy failure) — surface a trimmed snippet.
      message = raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
    }
  }

  return new NexusApiError(`${message} (HTTP ${response.status})`, response.status, url, body);
}

/** 204s and empty bodies are legitimate successes, so don't let JSON.parse throw on them. */
async function parseJsonBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const raw = await response.text();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new NexusApiError(
      `Expected JSON but the service returned unparseable content`,
      response.status,
      response.url,
      raw
    );
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    return err.name === "TimeoutError" || err.name === "AbortError" ? "request timed out" : err.message;
  }
  return String(err);
}
