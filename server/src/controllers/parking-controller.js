import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "../constants/messages.js";
import { HTTP_STATUS, buildErrorResponse, buildSuccessResponse } from "../utils/api-response.js";
import {
  validateHistoryQuery,
  validatePlateParam,
  validateVehicleEntry,
  validateVehicleExit,
} from "../validators/parking-validator.js";

/**
 * HTTP adapter for the parking endpoints.
 *
 * Controllers here do exactly three things: validate the incoming request, hand the clean
 * data to the service, and translate the answer into the response envelope. They compute
 * nothing. Every failure is forwarded with next(error) so a single middleware owns the
 * mapping from error to status code.
 *
 * The try/catch repetition is intentional at this stage: phase 7 introduces the
 * asyncHandler wrapper that removes it.
 */
export const createParkingController = ({ parkingService, checkDatabaseHealth }) => {
  if (!parkingService || !checkDatabaseHealth) {
    throw new TypeError("createParkingController requires a parkingService and a checkDatabaseHealth");
  }

  /** POST /api/v1/vehicles/entry */
  const registerEntry = async (request, response, next) => {
    try {
      const entryData = validateVehicleEntry(request.body);
      const parkingRecord = await parkingService.registerEntry(entryData);

      response
        .status(HTTP_STATUS.CREATED)
        .json(buildSuccessResponse({ message: SUCCESS_MESSAGES.ENTRY_REGISTERED, data: parkingRecord }));
    } catch (error) {
      next(error);
    }
  };

  /** POST /api/v1/vehicles/exit */
  const registerExit = async (request, response, next) => {
    try {
      const exitData = validateVehicleExit(request.body);
      const receipt = await parkingService.registerExit(exitData);

      response
        .status(HTTP_STATUS.OK)
        .json(buildSuccessResponse({ message: SUCCESS_MESSAGES.EXIT_REGISTERED, data: receipt }));
    } catch (error) {
      next(error);
    }
  };

  /** GET /api/v1/vehicles/parked */
  const getParkedVehicles = async (request, response, next) => {
    try {
      const parkedVehicles = await parkingService.getParkedVehicles();

      response.status(HTTP_STATUS.OK).json(
        buildSuccessResponse({
          message: SUCCESS_MESSAGES.PARKED_VEHICLES_RETRIEVED,
          data: parkedVehicles,
        }),
      );
    } catch (error) {
      next(error);
    }
  };

  /** GET /api/v1/vehicles/:plate */
  const getVehicleByPlate = async (request, response, next) => {
    try {
      const plate = validatePlateParam(request.params.plate);
      const parkingRecord = await parkingService.getVehicleByPlate(plate);

      response
        .status(HTTP_STATUS.OK)
        .json(buildSuccessResponse({ message: SUCCESS_MESSAGES.VEHICLE_RETRIEVED, data: parkingRecord }));
    } catch (error) {
      next(error);
    }
  };

  /** GET /api/v1/parking/availability */
  const getAvailability = async (request, response, next) => {
    try {
      const availability = await parkingService.getAvailability();

      response
        .status(HTTP_STATUS.OK)
        .json(buildSuccessResponse({ message: SUCCESS_MESSAGES.AVAILABILITY_RETRIEVED, data: availability }));
    } catch (error) {
      next(error);
    }
  };

  /** GET /api/v1/parking/history */
  const getHistory = async (request, response, next) => {
    try {
      const pagination = validateHistoryQuery(request.query);
      const history = await parkingService.getHistory(pagination);

      response
        .status(HTTP_STATUS.OK)
        .json(buildSuccessResponse({ message: SUCCESS_MESSAGES.HISTORY_RETRIEVED, data: history }));
    } catch (error) {
      next(error);
    }
  };

  /** GET /api/v1/vehicle-types */
  const getVehicleTypes = async (request, response, next) => {
    try {
      const vehicleTypes = await parkingService.getVehicleTypes();

      response
        .status(HTTP_STATUS.OK)
        .json(buildSuccessResponse({ message: SUCCESS_MESSAGES.VEHICLE_TYPES_RETRIEVED, data: vehicleTypes }));
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /health
   *
   * Answers 200 while the database responds and 503 once it stops. Reporting 200 on a
   * broken database would defeat the purpose of the endpoint: a load balancer would keep
   * sending traffic to an instance that cannot serve a single request.
   */
  const getHealth = async (request, response, next) => {
    try {
      const databaseHealth = await checkDatabaseHealth();

      const payload = {
        status: databaseHealth.isConnected ? "UP" : "DOWN",
        database: databaseHealth,
        uptimeSeconds: Math.floor(process.uptime()),
      };

      if (!databaseHealth.isConnected) {
        response
          .status(HTTP_STATUS.SERVICE_UNAVAILABLE)
          .json(buildErrorResponse({ message: ERROR_MESSAGES.SERVICE_UNHEALTHY }));
        return;
      }

      response
        .status(HTTP_STATUS.OK)
        .json(buildSuccessResponse({ message: SUCCESS_MESSAGES.SERVICE_HEALTHY, data: payload }));
    } catch (error) {
      next(error);
    }
  };

  return {
    registerEntry,
    registerExit,
    getParkedVehicles,
    getVehicleByPlate,
    getAvailability,
    getHistory,
    getVehicleTypes,
    getHealth,
  };
};
