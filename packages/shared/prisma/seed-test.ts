import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Clear out any previous test data so re-running this script is safe.
  await prisma.route.deleteMany({});
  await prisma.rateLimitConfig.deleteMany({});
  await prisma.apiKey.deleteMany({});
  await prisma.service.deleteMany({});

  const service = await prisma.service.create({
    data: {
      name: "api",
      baseUrl: "http://api:3000",
      healthCheckUrl: "/health",
    },
  });

  const rateLimit = await prisma.rateLimitConfig.create({
    data: { requestsPerWindow: 5, windowSeconds: 60 },
  });

  // No auth, no rate limit — baseline proxy test
  await prisma.route.create({
    data: {
      serviceId: service.id,
      pathPattern: "/ping-open",
      method: "GET",
      authType: "none",
    },
  });

  // Rate-limited route
  await prisma.route.create({
    data: {
      serviceId: service.id,
      pathPattern: "/ping-limited",
      method: "GET",
      authType: "none",
      rateLimitConfigId: rateLimit.id,
    },
  });

  // JWT-protected route
  await prisma.route.create({
    data: {
      serviceId: service.id,
      pathPattern: "/ping-secure",
      method: "GET",
      authType: "jwt",
    },
  });

  console.log("Seed complete:", {
    serviceId: service.id,
    rateLimitConfigId: rateLimit.id,
  });
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    throw err;
  })
  .finally(() => prisma.$disconnect());