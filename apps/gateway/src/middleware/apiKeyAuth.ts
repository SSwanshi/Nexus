import { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { prisma, logger } from "@nexus/shared";

/**
 * Verifies an API key on routes configured with authType: "apiKey".
 * Keys are stored hashed (never plaintext) — we hash the incoming
 * key the same way and compare against ApiKey.keyHash.
 */
export async function apiKeyAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const rawKey = req.headers["x-api-key"];

  if (!rawKey || typeof rawKey !== "string") {
    return res.status(401).json({ error: "Missing X-API-Key header" });
  }

  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { service: true },
  });

  if (!apiKey || apiKey.revokedAt) {
    logger.warn("Rejected request with invalid or revoked API key");
    return res.status(401).json({ error: "Invalid or revoked API key" });
  }

  next();
}