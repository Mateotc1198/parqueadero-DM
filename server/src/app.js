import cors from "cors";
import express from "express";

import { checkDatabaseHealth } from "./config/database.js";
import { envConfig } from "./config/env-config.js";
import { parkingConfig } from "./config/parking-config.js";
import { ERROR_MESSAGES } from "./constants/messages.js";
import { createParkingController } from "./controllers/parking-controller.js";
import { isOperationalError } from "./errors/app-error.js";
import { parkingRepository } from "./repositories/parking-repository.js";
import { createApiRouter } from "./routes/index.js";
import { createParkingService } from "./services/parking-service.js";
import { HTTP_STATUS, buildErrorResponse } from "./utils/api-response.js";

/**
 * A body of this size is already far larger than any payload these endpoints accept.
 * Capping it stops an oversized request from consuming memory before validation runs.
 */
const JSON_BODY_LIMIT = "10kb";

const JSON_PARSE_FAILURE_TYPE = "entity.parse.failed";

/**
 * Composition root.
 *
 * Every layer receives the one below it as an argument; none constructs its own
 * dependencies. That is what keeps the service free of infrastructure imports and lets the
 * controller be exercised without a database.
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

  // ---------------------------------------------------------------------------------
  // Provisional error handling. Phase 7 replaces both handlers with the dedicated
  // middlewares, the asyncHandler wrapper and the global exception hooks.
  // ---------------------------------------------------------------------------------

  app.use((request, response) => {
    response
      .status(HTTP_STATUS.NOT_FOUND)
      .json(buildErrorResponse({ message: ERROR_MESSAGES.ROUTE_NOT_FOUND }));
  });

  // Express identifies an error handler by its arity, so the fourth parameter must stay
  // declared even though it is unused.
  // eslint-disable-next-line no-unused-vars
  app.use((error, request, response, next) => {
    if (error?.type === JSON_PARSE_FAILURE_TYPE) {
      response.status(HTTP_STATUS.BAD_REQUEST).json(
        buildErrorResponse({
          message: ERROR_MESSAGES.VALIDATION_FAILED,
          errors: [ERROR_MESSAGES.MALFORMED_JSON],
        }),
      );
      return;
    }

    if (isOperationalError(error)) {
      response
        .status(error.statusCode)
        .json(buildErrorResponse({ message: error.message, errors: error.errors }));
      return;
    }

    // Unexpected failures are logged in full on the server and answered with a generic
    // message, so no stack trace or SQL fragment ever reaches the client.
    console.error("Unhandled error:", error);

    response
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(buildErrorResponse({ message: ERROR_MESSAGES.INTERNAL_ERROR }));
  });

  return app;
};
