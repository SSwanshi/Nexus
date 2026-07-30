import { Request, Response, NextFunction } from "express";
import { logger } from "@nexus/shared";

/**
 * Centralized error handler — must be registered LAST in the middleware
 * chain (Express convention: 4-arg signature marks it as an error handler).
 * Ensures no unhandled error ever leaks a stack trace to the client.
 */
export function errorHandlerMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  logger.error({ err, path: req.path, method: req.method }, "Unhandled error in gateway");

  if (res.headersSent) {
    return;
  }

  res.status(500).json({ error: "Internal gateway error" });
}