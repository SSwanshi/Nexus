import { prisma, logger } from "@nexus/shared";

export interface ResolvedRoute {
  id: string;
  pathPattern: string;
  method: string;
  authType: string;
  targetBaseUrl: string;
  rateLimitConfig: { requestsPerWindow: number; windowSeconds: number } | null;
}

/**
 * Pulls the current routing table from Postgres. Called once at boot and
 * cached in memory — refreshing on every request would add a DB round-trip
 * to every single call through the gateway.
 *
 * TODO (later phase): add a refresh interval or cache-invalidation webhook
 * from the dashboard when routes are edited, instead of requiring a restart.
 */
let cachedRoutes: ResolvedRoute[] = [];

export async function loadRoutes(): Promise<ResolvedRoute[]> {
  const routes = await prisma.route.findMany({
    include: { service: true, rateLimitConfig: true },
  });

  cachedRoutes = routes.map((r) => ({
    id: r.id,
    pathPattern: r.pathPattern,
    method: r.method,
    authType: r.authType,
    targetBaseUrl: r.service.baseUrl,
    rateLimitConfig: r.rateLimitConfig
      ? {
          requestsPerWindow: r.rateLimitConfig.requestsPerWindow,
          windowSeconds: r.rateLimitConfig.windowSeconds,
        }
      : null,
  }));

  logger.info(`Loaded ${cachedRoutes.length} routes from database`);
  return cachedRoutes;
}

export function getCachedRoutes(): ResolvedRoute[] {
  return cachedRoutes;
}

export function findRouteFor(path: string, method: string): ResolvedRoute | undefined {
  return cachedRoutes.find(
    (r) => path.startsWith(r.pathPattern) && r.method.toUpperCase() === method.toUpperCase()
  );
}