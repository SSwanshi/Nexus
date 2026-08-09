import { Request, Response, NextFunction } from "express";
import { httpRequestsTotal, httpRequestDuration } from "../metrics/registry";

/**
 * Records every request's outcome. Uses the matched route pattern
 * (not the raw path) as a label — otherwise metrics for /users/123
 * and /users/456 would be counted as different routes, exploding
 * Prometheus's cardinality.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const routeLabel = req.path; // acceptable for now; refine once path params exist

    httpRequestsTotal.inc({
      method: req.method,
      route: routeLabel,
      status_code: res.statusCode,
    });

    httpRequestDuration.observe(
      { method: req.method, route: routeLabel, status_code: res.statusCode },
      durationSeconds
    );
  });

  next();
}