import { createProxyMiddleware } from "http-proxy-middleware";
import { Request, Response, NextFunction } from "express";
import { findRouteFor } from "../routing/loadRoutes";
import { jwtAuthMiddleware } from "../middleware/auth";
import { apiKeyAuthMiddleware } from "../middleware/apiKeyAuth";
import { logger } from "@nexus/shared";

/**
 * Single entry point that: resolves the matching route, applies the
 * correct auth strategy for that route, then proxies to the target
 * service. Rate limiting hooks in here too (added next).
 */
export function gatewayHandler(req: Request, res: Response, next: NextFunction) {
  const route = findRouteFor(req.path, req.method);

  if (!route) {
    return res.status(404).json({ error: "No matching route configured" });
  }

  const runProxy = () => {
    const proxy = createProxyMiddleware({
      target: route.targetBaseUrl,
      changeOrigin: true,
      onError: (err: any) => {
        logger.error({ err, route: route.pathPattern }, "Proxy error");
      },
    });
    proxy(req, res, next);
  };

  if (route.authType === "jwt") {
    return jwtAuthMiddleware(req as any, res, () => runProxy());
  }

  if (route.authType === "apiKey") {
    return apiKeyAuthMiddleware(req, res, () => runProxy());
  }

  // authType === "none"
  return runProxy();
}