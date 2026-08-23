import path from "node:path";

import cors from "cors";
import express from "express";

import { checkDatabaseHealth } from "./config/database.js";
import { envConfig } from "./config/env-config.js";
import { parkingConfig } from "./config/parking-config.js";
import { createParkingController } from "./controllers/parking-controller.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { notFoundHandler } from "./middlewares/not-found-handler.js";
import { parkingRepository } from "./repositories/parking-repository.js";
import { createApiRouter } from "./routes/index.js";
import { createParkingService } from "./services/parking-service.js";

/**
 * A body of this size is already far larger than any payload these endpoints accept.
 * Capping it stops an oversized request from consuming memory before validation runs.
 */
const JSON_BODY_LIMIT = "10kb";

/**
 * The web client is plain HTML, CSS and native ES modules, so it needs no build step and
 * can be served straight from disk. Serving it from the API means both share one origin:
 * the client calls the relative path /api/v1 and CORS never enters the normal flow.
 */
const CLIENT_DIRECTORY = path.resolve(import.meta.dirname, "..", "..", "client");

/**
 * Composition root.
 *
 * Every layer receives the one below it as an argument; none constructs its own
 * dependencies. That is what keeps the service free of infrastructure imports and lets the
 * controller be exercised without a database.
 *
 * Middleware order is not decoration. Parsing runs before routing, routing before the
 * not found handler, and the error handler is last, because Express only forwards a
 * failure to middlewares registered after the one that raised it.
 */
export const createApp = () => {
  const parkingService = createParkingService({ parkingRepository, parkingConfig });
  const parkingController = createParkingController({ parkingService, checkDatabaseHealth });

  const app = express();

  // Removes the "X-Powered-By: Express" header, which advertises the framework to a scanner
  // without giving a legitimate client anything.
  app.disable("x-powered-by");

  app.use(cors({ origin: envConfig.server.corsOrigins }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use(createApiRouter({ parkingController }));

  // Static files come after the API on purpose. The other way round, every API request
  // would first look for a file on disk, and an unknown /api/v1 path would fall through to
  // the static handler instead of reaching the JSON not found response.
  app.use(express.static(CLIENT_DIRECTORY));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
