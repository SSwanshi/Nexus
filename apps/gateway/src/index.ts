import express from "express";
import swaggerUi from "swagger-ui-express";
import { loadConfig, logger } from "@nexus/shared";
import { loadRoutes } from "./routing/loadRoutes";
import { gatewayHandler } from "./proxy/reverseProxy";
import { requestLoggerMiddleware } from "./middleware/requestLogger";
import { errorHandlerMiddleware } from "./middleware/errorHandler";
import { metricsMiddleware } from "./middleware/metricsMiddleware";
import { register } from "./metrics/registry";
import { openApiSpec } from "./docs/openapi";
import { servicesRouter } from "./routes/services";

const config = loadConfig();
const app = express();

app.use(requestLoggerMiddleware);
app.use(metricsMiddleware);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: config.SERVICE_NAME, timestamp: new Date().toISOString() });
});

app.get("/metrics", async (_req, res) => {
  res.setHeader("Content-Type", register.contentType);
  res.send(await register.metrics());
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

// Gateway's own control-plane APIs — must be registered before the catch-all proxy.
app.use(servicesRouter);

app.use(gatewayHandler);
app.use(errorHandlerMiddleware);

async function start() {
  await loadRoutes();
  app.listen(config.PORT, () => {
    logger.info(`Gateway service listening on port ${config.PORT}`);
    logger.info(`Swagger docs available at http://localhost:${config.PORT}/docs`);
  });
}

start();