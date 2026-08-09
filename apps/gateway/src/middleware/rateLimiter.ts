import { Request, Response, NextFunction } from "express";
import { redis } from "../redis/client";
import { logger } from "@nexus/shared";
import type { ResolvedRoute } from "../routing/loadRoutes";
import { rateLimitRejections } from "../metrics/registry";

/**
 * Fixed-window rate limiter keyed by route + client identity.
 * Simple and fast (one INCR + one EXPIRE per request) — a sliding-window
 * or token-bucket algorithm is a reasonable upgrade later, but fixed-window
 * is the right first version: easy to reason about, easy to explain in
 * an interview, and correct under normal load.
 */
export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
  route: ResolvedRoute
) {
  if (!route.rateLimitConfig) {
    return next();
  }

  const { requestsPerWindow, windowSeconds } = route.rateLimitConfig;

  // Key by API key if present, otherwise by IP — so authenticated clients
  // get their own bucket instead of sharing one with everyone on the route.
  const identity = (req.headers["x-api-key"] as string) || req.ip || "anonymous";
  const key = `ratelimit:${route.id}:${identity}`;

  try {
    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }

    if (current > requestsPerWindow) {
      const ttl = await redis.ttl(key);
      res.setHeader("Retry-After", ttl > 0 ? ttl : windowSeconds);
      rateLimitRejections.inc({ route: route.id });
      return res.status(429).json({ error: "Rate limit exceeded", retryAfterSeconds: ttl });
    }

    res.setHeader("X-RateLimit-Limit", requestsPerWindow);
    res.setHeader("X-RateLimit-Remaining", Math.max(requestsPerWindow - current, 0));
    next();
  } catch (err) {
    // Redis failure should not take the gateway down — fail open, but log loudly.
    logger.error({ err }, "Rate limiter failed, allowing request through");
    next();
  }
}