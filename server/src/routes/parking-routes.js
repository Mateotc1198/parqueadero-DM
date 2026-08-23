import { Router } from "express";

/**
 * Parking endpoints, mounted under the versioned API prefix.
 *
 * Routes only map a method and a path to a controller handler. No validation, no logic.
 */
export const createParkingRoutes = (parkingController) => {
  const router = Router();

  router.post("/vehicles/entry", parkingController.registerEntry);
  router.post("/vehicles/exit", parkingController.registerExit);

  // "/vehicles/parked" MUST be declared before "/vehicles/:plate". Express matches in
  // declaration order, so the reversed order would capture "parked" as a plate and answer
  // a validation error instead of the list of parked vehicles.
  router.get("/vehicles/parked", parkingController.getParkedVehicles);
  router.get("/vehicles/:plate", parkingController.getVehicleByPlate);

  router.get("/parking/availability", parkingController.getAvailability);
  router.get("/parking/history", parkingController.getHistory);

  router.get("/vehicle-types", parkingController.getVehicleTypes);

  return router;
};
