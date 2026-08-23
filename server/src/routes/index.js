import { Router } from "express";

import { createParkingRoutes } from "./parking-routes.js";

/**
 * Versioning the API in the path keeps a future breaking change from stranding existing
 * clients: /api/v2 can live alongside /api/v1 instead of replacing it.
 */
export const API_PREFIX = "/api/v1";

/**
 * Root router of the application.
 *
 * The health check sits outside the versioned prefix on purpose: monitoring probes and
 * container orchestrators must not have to follow the API version as it evolves.
 */
export const createApiRouter = ({ parkingController }) => {
  const router = Router();

  router.get("/health", parkingController.getHealth);
  router.use(API_PREFIX, createParkingRoutes(parkingController));

  return router;
};
