import { createProxyMiddleware } from "http-proxy-middleware";
import { Request, Response, NextFunction } from "express";
import { findRouteFor } from "../routing/loadRoutes";
import { jwtAuthMiddleware } from "../middleware/auth";
import { apiKeyAuthMiddleware } from "../middleware/apiKeyAuth";
import { rateLimitMiddleware } from "../middleware/rateLimiter";
import { logger } from "@nexus/shared";
import type { RequestWithContext } from "../middleware/requestLogger";

export function gatewayHandler(req: Request, res: Response, next: NextFunction) {
  const route = findRouteFor(req.path, req.method);

  if (!route) {
    return res.status(404).json({ error: "No matching route configured" });
  }

  const runProxy = () => {
    const proxy = createProxyMiddleware({
      target: route.targetBaseUrl,
      changeOrigin: true,
      onProxyReq: (proxyReq) => {
        // Forward the correlation ID so the downstream service's logs
        // can be joined with the gateway's for the same request.
        const correlationId = (req as RequestWithContext).correlationId;
        if (correlationId) proxyReq.setHeader("X-Correlation-Id", correlationId);
      },
      onError: (err) => {
        logger.error({ err, route: route.pathPattern }, "Proxy error");
      },
    });
    proxy(req, res, next);
  };

  const runAuthThenProxy = () => {
    if (route.authType === "jwt") {
      return jwtAuthMiddleware(req as any, res, runProxy);
    }
    if (route.authType === "apiKey") {
      return apiKeyAuthMiddleware(req, res, runProxy);
    }
    return runProxy();
  };

  rateLimitMiddleware(req, res, runAuthThenProxy, route);
}