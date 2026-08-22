import express, { Router, type RequestHandler } from "express";
import { prisma, logger } from "@nexus/shared";

/** Express 4 doesn't catch rejected promises from async handlers — see routes in the scheduler. */
const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

export const servicesRouter: Router = Router();

/**
 * POST /services — register a backend service with the gateway.
 *
 * Body: { name, baseUrl, healthCheckUrl }
 *
 * Note the body parser is mounted per-route rather than app-wide: the gateway's
 * catch-all reverse proxy re-streams the raw request to the upstream, and a
 * global express.json() would consume that stream before the proxy sees it.
 */
servicesRouter.post(
  "/services",
  express.json(),
  asyncHandler(async (req, res) => {
    const { name, baseUrl, healthCheckUrl } = req.body ?? {};

    const missing = ["name", "baseUrl", "healthCheckUrl"].filter(
      (field) => typeof req.body?.[field] !== "string" || req.body[field].trim() === ""
    );
    if (missing.length > 0) {
      res.status(400).json({ error: `Missing or invalid string fields: ${missing.join(", ")}` });
      return;
    }

    const existing = await prisma.service.findUnique({ where: { name } });
    if (existing) {
      res.status(409).json({ error: `A service named '${name}' is already registered` });
      return;
    }

    const service = await prisma.service.create({
      data: { name, baseUrl, healthCheckUrl },
    });

    logger.info({ serviceId: service.id, name: service.name }, "Service registered");
    res.status(201).json(service);
  })
);
