import express from "express";
import { loadConfig, logger } from "@nexus/shared";
import { loadRoutes } from "./routing/loadRoutes";
import { gatewayHandler } from "./proxy/reverseProxy";

const config = loadConfig();
const app = express();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: config.SERVICE_NAME, timestamp: new Date().toISOString() });
});

// All other traffic goes through the routing + auth + proxy pipeline.
app.use(gatewayHandler);

async function start() {
  await loadRoutes();
  app.listen(config.PORT, () => {
    logger.info(`Gateway service listening on port ${config.PORT}`);
  });
}

start();