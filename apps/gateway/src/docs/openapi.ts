/**
 * Minimal OpenAPI spec for the gateway's own endpoints (health, metrics).
 * Proxied routes are dynamic (driven by the Route table), so they aren't
 * enumerable here — this documents the gateway's fixed surface only.
 * Per-service API docs belong to each backend service, not the gateway.
 */
export const openApiSpec = {
  openapi: "3.0.0",
  info: {
    title: "Nexus Gateway API",
    version: "0.1.0",
    description: "Single entry point for all client traffic. Routes, auth, and rate limits are configured dynamically via the dashboard/database.",
  },
  paths: {
    "/health": {
      get: {
        summary: "Gateway health check",
        responses: {
          "200": {
            description: "Gateway is up",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string" },
                    service: { type: "string" },
                    timestamp: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/metrics": {
      get: {
        summary: "Prometheus metrics endpoint",
        responses: {
          "200": {
            description: "Metrics in Prometheus text exposition format",
            content: { "text/plain": {} },
          },
        },
      },
    },
    "/services": {
      post: {
        summary: "Register a backend service",
        description: "Adds a service to the registry. Routes pointing at it are configured separately.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "baseUrl", "healthCheckUrl"],
                properties: {
                  name: { type: "string", description: "Unique service name" },
                  baseUrl: { type: "string", description: "Where matching traffic is forwarded" },
                  healthCheckUrl: { type: "string", description: "Endpoint to poll for liveness" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Service registered",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    baseUrl: { type: "string" },
                    healthCheckUrl: { type: "string" },
                    createdAt: { type: "string" },
                  },
                },
              },
            },
          },
          "400": { description: "Missing or invalid fields" },
          "409": { description: "A service with that name already exists" },
        },
      },
    },
  },
};