import client from "prom-client";

/**
 * Central Prometheus registry. We collect default Node.js metrics
 * (memory, event loop lag, GC) plus custom ones for gateway-specific
 * behavior — request counts and latency, broken down by route/status.
 */
export const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const httpRequestsTotal = new client.Counter({
  name: "gateway_http_requests_total",
  help: "Total HTTP requests handled by the gateway",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

export const httpRequestDuration = new client.Histogram({
  name: "gateway_http_request_duration_seconds",
  help: "Request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

export const rateLimitRejections = new client.Counter({
  name: "gateway_rate_limit_rejections_total",
  help: "Total requests rejected due to rate limiting",
  labelNames: ["route"],
  registers: [register],
});