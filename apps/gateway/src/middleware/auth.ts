import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { loadConfig, logger } from "@nexus/shared";

const config = loadConfig();

export interface AuthenticatedRequest extends Request {
  user?: { sub: string; role: string };
}

/**
 * Verifies a Bearer JWT on routes configured with authType: "jwt".
 * Route-level auth type comes from the DB (Route.authType), checked
 * in routing/loadRoutes.ts before this middleware ever runs.
 */
export function jwtAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as { sub: string; role: string };
    req.user = payload;
    next();
  } catch (err) {
    logger.warn({ err }, "JWT verification failed");
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}