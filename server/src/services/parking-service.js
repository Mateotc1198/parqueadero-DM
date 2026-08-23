import { ERROR_MESSAGES } from "../constants/messages.js";
import { ConflictError, NotFoundError, UnprocessableEntityError } from "../errors/app-error.js";
import { calculateBilling } from "./billing-service.js";

/**
 * Business rules of the parking lot.
 *
 * This module imports no repository, no configuration file and no framework: the
 * repository and the policy arrive as arguments, and the composition root wires the real
 * ones. Two consequences follow. The service can be unit tested against a fake repository
 * with no database and no environment variables, and the connection pool is never
 * constructed just because a test imported this file.
 */

/**
 * @param {object} dependencies
 * @param {object} dependencies.parkingRepository persistence contract from the repository layer
 * @param {{ capacity: number, gracePeriodMinutes: number }} dependencies.parkingConfig
 */
export const createParkingService = ({ parkingRepository, parkingConfig } = {}) => {
  if (!parkingRepository || !parkingConfig) {
    throw new TypeError("createParkingService requires a parkingRepository and a parkingConfig");
  }

  /**
   * Rule 1: a plate cannot be inside twice.
   * Rule 2: no entry once the lot is full.
   *
   * The whole check runs inside one transaction that starts by taking the advisory lock.
   * Without it, two simultaneous requests both read an occupancy of 49 against a capacity
   * of 50 and both are admitted.
   *
   * The duplicate plate is reported before the full lot on purpose: it is the more
   * specific diagnosis and the more actionable one for whoever is at the booth.
   */
  const registerEntry = async ({ plate, vehicleType, entryTime }) => {
    const effectiveEntryTime = entryTime ?? new Date();

    return parkingRepository.runInTransaction(async (repository) => {
      await repository.lockParkingLot();

      const activeRecord = await repository.findActiveRecordByPlate(plate);

      if (activeRecord) {
        throw new ConflictError(ERROR_MESSAGES.PLATE_ALREADY_PARKED);
      }

      const occupied = await repository.countActiveRecords();

      if (occupied >= parkingConfig.capacity) {
        throw new ConflictError(ERROR_MESSAGES.PARKING_LOT_FULL);
      }

      try {
        return await repository.createParkingRecord({
          plate,
          vehicleType,
          entryTime: effectiveEntryTime,
        });
      } catch (error) {
        // Safety net for the check above: the partial unique index guarantees the rule at
        // database level, and this keeps the caller seeing a clear message instead of a
        // raw driver error even if the lock were ever bypassed.
        if (repository.isUniqueActivePlateViolation(error)) {
          throw new ConflictError(ERROR_MESSAGES.PLATE_ALREADY_PARKED);
        }

        throw error;
      }
    });
  };

  /**
   * Rule 3: the exit cannot precede the entry.
   * Rule 4: a plate that is not inside cannot exit.
   * Rules 5 and 6: stay and amount are computed by the pure billing service.
   */
  const registerExit = async ({ plate, exitTime }) => {
    const effectiveExitTime = exitTime ?? new Date();

    return parkingRepository.runInTransaction(async (repository) => {
      const activeRecord = await repository.findActiveRecordByPlate(plate);

      if (!activeRecord) {
        throw new NotFoundError(ERROR_MESSAGES.VEHICLE_NOT_FOUND);
      }

      const entryTime = new Date(activeRecord.entryTime);

      if (effectiveExitTime.getTime() < entryTime.getTime()) {
        throw new UnprocessableEntityError(ERROR_MESSAGES.EXIT_BEFORE_ENTRY);
      }

      const vehicleType = await repository.findVehicleTypeByCode(activeRecord.vehicleType);

      // Unreachable while the foreign key stands, kept because this is the money path:
      // a missing rate would otherwise reach the billing service as undefined.
      if (!vehicleType) {
        throw new NotFoundError(ERROR_MESSAGES.VEHICLE_TYPE_NOT_FOUND);
      }

      const billing = calculateBilling({
        entryTime,
        exitTime: effectiveExitTime,
        hourlyRate: vehicleType.hourlyRate,
        graceMinutes: parkingConfig.gracePeriodMinutes,
      });

      const closedRecord = await repository.closeParkingRecord({
        id: activeRecord.id,
        exitTime: effectiveExitTime,
        stayMinutes: billing.stayMinutes,
        totalAmount: billing.totalAmount,
      });

      // The update carries "AND status = 'ACTIVE'". Two simultaneous exit requests mean one
      // closes the ticket and the other matches no row: nobody is charged twice.
      if (!closedRecord) {
        throw new NotFoundError(ERROR_MESSAGES.VEHICLE_NOT_FOUND);
      }

      return {
        ...closedRecord,
        vehicleTypeDescription: vehicleType.description,
        billing: {
          stayDuration: billing.stayDuration,
          billableHours: billing.billableHours,
          hourlyRate: billing.hourlyRate,
          graceMinutes: billing.graceMinutes,
          isWithinGracePeriod: billing.isWithinGracePeriod,
        },
      };
    });
  };

  const getParkedVehicles = () => parkingRepository.findActiveRecords();

  const getVehicleByPlate = async (plate) => {
    const activeRecord = await parkingRepository.findActiveRecordByPlate(plate);

    if (!activeRecord) {
      throw new NotFoundError(ERROR_MESSAGES.VEHICLE_NOT_FOUND);
    }

    return activeRecord;
  };

  const getAvailability = async () => {
    const occupied = await parkingRepository.countActiveRecords();

    return {
      capacity: parkingConfig.capacity,
      occupied,
      // Clamped at zero: lowering the configured capacity below the current occupancy is a
      // legitimate operational change and must not surface as a negative number.
      available: Math.max(parkingConfig.capacity - occupied, 0),
      isFull: occupied >= parkingConfig.capacity,
    };
  };

  const getHistory = ({ limit, offset } = {}) =>
    parkingRepository.findAllRecords({ limit, offset });

  const getVehicleTypes = () => parkingRepository.findAllVehicleTypes();

  return {
    registerEntry,
    registerExit,
    getParkedVehicles,
    getVehicleByPlate,
    getAvailability,
    getHistory,
    getVehicleTypes,
  };
};
