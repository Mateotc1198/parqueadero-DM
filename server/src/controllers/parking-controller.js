import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "../constants/messages.js";
import { HTTP_STATUS, buildErrorResponse, buildSuccessResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  validateHistoryQuery,
  validatePlateParam,
  validateVehicleEntry,
  validateVehicleExit,
} from "../validators/parking-validator.js";

/**
 * HTTP adapter for the parking endpoints.
 *
 * Controllers do exactly three things: validate the incoming request, hand the clean data
 * to the service, and translate the answer into the response envelope. They compute nothing.
 *
 * Every handler is wrapped in asyncHandler, so a rejected promise or a validator throw
 * lands on the error middleware without a single try/catch in this file.
 */
export const createParkingController = ({ parkingService, checkDatabaseHealth }) => {
  if (!parkingService || !checkDatabaseHealth) {
    throw new TypeError("createParkingController requires a parkingService and a checkDatabaseHealth");
  }

  /** POST /api/v1/vehicles/entry */
  const registerEntry = asyncHandler(async (request, response) => {
    const entryData = validateVehicleEntry(request.body);
    const parkingRecord = await parkingService.registerEntry(entryData);

    response
      .status(HTTP_STATUS.CREATED)
      .json(buildSuccessResponse({ message: SUCCESS_MESSAGES.ENTRY_REGISTERED, data: parkingRecord }));
  });

  /** POST /api/v1/vehicles/exit */
  const registerExit = asyncHandler(async (request, response) => {
    const exitData = validateVehicleExit(request.body);
    const receipt = await parkingService.registerExit(exitData);

    response
      .status(HTTP_STATUS.OK)
      .json(buildSuccessResponse({ message: SUCCESS_MESSAGES.EXIT_REGISTERED, data: receipt }));
  });

  /** GET /api/v1/vehicles/parked */
  const getParkedVehicles = asyncHandler(async (request, response) => {
    const parkedVehicles = await parkingService.getParkedVehicles();

    response
      .status(HTTP_STATUS.OK)
      .json(buildSuccessResponse({
        message: SUCCESS_MESSAGES.PARKED_VEHICLES_RETRIEVED,
        data: parkedVehicles,
      }));
  });

  /** GET /api/v1/vehicles/:plate */
  const getVehicleByPlate = asyncHandler(async (request, response) => {
    const plate = validatePlateParam(request.params.plate);
    const parkingRecord = await parkingService.getVehicleByPlate(plate);

    response
      .status(HTTP_STATUS.OK)
      .json(buildSuccessResponse({ message: SUCCESS_MESSAGES.VEHICLE_RETRIEVED, data: parkingRecord }));
  });

  /** GET /api/v1/parking/availability */
  const getAvailability = asyncHandler(async (request, response) => {
    const availability = await parkingService.getAvailability();

    response
      .status(HTTP_STATUS.OK)
      .json(buildSuccessResponse({ message: SUCCESS_MESSAGES.AVAILABILITY_RETRIEVED, data: availability }));
  });

  /** GET /api/v1/parking/history */
  const getHistory = asyncHandler(async (request, response) => {
    const pagination = validateHistoryQuery(request.query);
    const history = await parkingService.getHistory(pagination);

    response
      .status(HTTP_STATUS.OK)
      .json(buildSuccessResponse({ message: SUCCESS_MESSAGES.HISTORY_RETRIEVED, data: history }));
  });

  /** GET /api/v1/vehicle-types */
  const getVehicleTypes = asyncHandler(async (request, response) => {
    const vehicleTypes = await parkingService.getVehicleTypes();

    response
      .status(HTTP_STATUS.OK)
      .json(buildSuccessResponse({ message: SUCCESS_MESSAGES.VEHICLE_TYPES_RETRIEVED, data: vehicleTypes }));
  });

  /**
   * GET /health
   *
   * Answers 200 while the database responds and 503 once it stops. Reporting 200 on a
   * broken database would defeat the purpose of the endpoint: a load balancer would keep
   * sending traffic to an instance that cannot serve a single request.
   */
  const getHealth = asyncHandler(async (request, response) => {
    const databaseHealth = await checkDatabaseHealth();

    if (!databaseHealth.isConnected) {
      response
        .status(HTTP_STATUS.SERVICE_UNAVAILABLE)
        .json(buildErrorResponse({ message: ERROR_MESSAGES.SERVICE_UNHEALTHY }));
      return;
    }

    response.status(HTTP_STATUS.OK).json(
      buildSuccessResponse({
        message: SUCCESS_MESSAGES.SERVICE_HEALTHY,
        data: {
          status: "UP",
          database: databaseHealth,
          uptimeSeconds: Math.floor(process.uptime()),
        },
      }),
    );
  });

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
