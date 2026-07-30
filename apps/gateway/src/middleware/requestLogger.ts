import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { createLogger } from "@nexus/shared";

export interface RequestWithContext extends Request {
  correlationId: string;
  log: ReturnType<typeof createLogger>;
}

/**
 * Attaches a correlation ID to every request — reused from an incoming
 * X-Correlation-Id header if the caller already has one (e.g. it's being
 * forwarded from another DevFlow service), otherwise generates a new one.
 * This ID threads through to the proxied service and into every log line,
 * which is what makes Phase 7 (production hardening) tracing possible.
 */
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
  const correlationId = (req.headers["x-correlation-id"] as string) || randomUUID();
  const log = createLogger(correlationId);

  (req as RequestWithContext).correlationId = correlationId;
  (req as RequestWithContext).log = log;

  res.setHeader("X-Correlation-Id", correlationId);

  const start = Date.now();
  log.info({ method: req.method, path: req.path }, "Incoming request");

  res.on("finish", () => {
    log.info(
      { method: req.method, path: req.path, statusCode: res.statusCode, durationMs: Date.now() - start },
      "Request completed"
    );
  });

  next();
}