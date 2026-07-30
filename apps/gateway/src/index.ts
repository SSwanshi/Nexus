import express from "express";
import { loadConfig, logger } from "@nexus/shared";
import { loadRoutes } from "./routing/loadRoutes";
import { gatewayHandler } from "./proxy/reverseProxy";
import { requestLoggerMiddleware } from "./middleware/requestLogger";
import { errorHandlerMiddleware } from "./middleware/errorHandler";

const config = loadConfig();
const app = express();

// Order matters: logging first (so every request is captured, even 404s),
// then health check (bypasses the gateway pipeline entirely), then routing,
// then the error handler last.
app.use(requestLoggerMiddleware);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: config.SERVICE_NAME, timestamp: new Date().toISOString() });
});

app.use(gatewayHandler);
app.use(errorHandlerMiddleware);

async function start() {
  await loadRoutes();
  app.listen(config.PORT, () => {
    logger.info(`Gateway service listening on port ${config.PORT}`);
  });
}

start();