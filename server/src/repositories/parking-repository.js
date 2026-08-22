import { query, withTransaction } from "../config/database.js";
import {
  PARKING_STATUS,
  toParkingRecord,
  toParkingRecordList,
  toVehicleType,
  toVehicleTypeList,
} from "../models/parking-record.js";

const POSTGRES_UNIQUE_VIOLATION = "23505";
const ACTIVE_PLATE_INDEX_NAME = "idx_active_plate";

/**
 * Advisory lock key for the parking lot as a whole. Any constant works as long as every
 * process uses the same one; it only needs to be unique among the advisory locks of this
 * database. Held for the duration of the surrounding transaction and released with it.
 */
const PARKING_LOT_LOCK_KEY = 4210001;

// Safety caps, not input validation: they keep a missing or absurd pagination argument
// from turning the history query into an unbounded sequential scan.
const DEFAULT_HISTORY_LIMIT = 100;
const MAX_HISTORY_LIMIT = 500;

// Columns are always listed explicitly. A "SELECT *" would silently change the shape of
// every mapped object the day a column is added to the table.
const PARKING_RECORD_COLUMNS = `
         id,
         plate,
         vehicle_type,
         entry_time,
         exit_time,
         stay_minutes,
         total_amount,
         status,
         created_at`;

const INSERT_PARKING_RECORD = `
  INSERT INTO parking_records (plate, vehicle_type, entry_time, status)
       VALUES ($1, $2, $3, $4)
    RETURNING ${PARKING_RECORD_COLUMNS}
`;

const SELECT_ACTIVE_RECORD_BY_PLATE = `
  SELECT ${PARKING_RECORD_COLUMNS}
    FROM parking_records
   WHERE plate = $1
     AND status = $2
   LIMIT 1
`;

const COUNT_ACTIVE_RECORDS = `
  SELECT COUNT(*)::int AS active_count
    FROM parking_records
   WHERE status = $1
`;

const SELECT_ACTIVE_RECORDS = `
  SELECT ${PARKING_RECORD_COLUMNS}
    FROM parking_records
   WHERE status = $1
   ORDER BY entry_time DESC, id DESC
`;

const SELECT_ALL_RECORDS = `
  SELECT ${PARKING_RECORD_COLUMNS}
    FROM parking_records
   ORDER BY entry_time DESC, id DESC
   LIMIT $1 OFFSET $2
`;

// The status guard in the WHERE clause makes the update idempotent: a second exit request
// for the same record matches no row instead of overwriting an already closed ticket.
const CLOSE_PARKING_RECORD = `
  UPDATE parking_records
     SET exit_time    = $2,
         stay_minutes = $3,
         total_amount = $4,
         status       = $5
   WHERE id = $1
     AND status = $6
 RETURNING ${PARKING_RECORD_COLUMNS}
`;

const SELECT_ALL_VEHICLE_TYPES = `
  SELECT code, description, hourly_rate
    FROM vehicle_types
   ORDER BY code
`;

const SELECT_VEHICLE_TYPE_BY_CODE = `
  SELECT code, description, hourly_rate
    FROM vehicle_types
   WHERE code = $1
`;

const ACQUIRE_PARKING_LOT_LOCK = "SELECT pg_advisory_xact_lock($1)";

const normalizeLimit = (limit) => {
  const parsedLimit = Number(limit);

  if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
    return DEFAULT_HISTORY_LIMIT;
  }

  return Math.min(parsedLimit, MAX_HISTORY_LIMIT);
};

const normalizeOffset = (offset) => {
  const parsedOffset = Number(offset);

  return Number.isInteger(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;
};

/**
 * Builds the repository bound to an executor. Passing no client runs every statement on
 * the pool; passing a transaction client makes every statement join that transaction.
 */
const createParkingRepository = (client) => {
  const execute = (text, parameters = []) =>
    (client ? client.query(text, parameters) : query(text, parameters));

  const repository = {
    createParkingRecord: async ({ plate, vehicleType, entryTime }) => {
      const { rows } = await execute(INSERT_PARKING_RECORD, [
        plate,
        vehicleType,
        entryTime,
        PARKING_STATUS.ACTIVE,
      ]);

      return toParkingRecord(rows[0]);
    },

    findActiveRecordByPlate: async (plate) => {
      const { rows } = await execute(SELECT_ACTIVE_RECORD_BY_PLATE, [
        plate,
        PARKING_STATUS.ACTIVE,
      ]);

      return toParkingRecord(rows[0]);
    },

    countActiveRecords: async () => {
      const { rows } = await execute(COUNT_ACTIVE_RECORDS, [PARKING_STATUS.ACTIVE]);

      return rows[0].active_count;
    },

    findActiveRecords: async () => {
      const { rows } = await execute(SELECT_ACTIVE_RECORDS, [PARKING_STATUS.ACTIVE]);

      return toParkingRecordList(rows);
    },

    findAllRecords: async ({ limit, offset } = {}) => {
      const { rows } = await execute(SELECT_ALL_RECORDS, [
        normalizeLimit(limit),
        normalizeOffset(offset),
      ]);

      return toParkingRecordList(rows);
    },

    closeParkingRecord: async ({ id, exitTime, stayMinutes, totalAmount }) => {
      const { rows } = await execute(CLOSE_PARKING_RECORD, [
        id,
        exitTime,
        stayMinutes,
        totalAmount,
        PARKING_STATUS.CLOSED,
        PARKING_STATUS.ACTIVE,
      ]);

      return toParkingRecord(rows[0]);
    },

    findAllVehicleTypes: async () => {
      const { rows } = await execute(SELECT_ALL_VEHICLE_TYPES);

      return toVehicleTypeList(rows);
    },

    findVehicleTypeByCode: async (code) => {
      const { rows } = await execute(SELECT_VEHICLE_TYPE_BY_CODE, [code]);

      return toVehicleType(rows[0]);
    },

    /**
     * Serializes the capacity check with the insert that follows it. Without this,
     * two concurrent entries can both read the same occupancy and both be admitted.
     */
    lockParkingLot: async () => {
      if (!client) {
        throw new Error("lockParkingLot must be called inside runInTransaction");
      }

      await execute(ACQUIRE_PARKING_LOT_LOCK, [PARKING_LOT_LOCK_KEY]);
    },

    /**
     * Runs the callback inside a transaction and hands it a repository bound to it,
     * so callers never touch a pg client. Nesting reuses the current transaction
     * instead of taking a second connection, which would deadlock on its own lock.
     */
    runInTransaction: (callback) =>
      (client
        ? callback(repository)
        : withTransaction((transactionClient) =>
            callback(createParkingRepository(transactionClient)),
          )),
  };

  return repository;
};

/**
 * Recognizes the duplicate active plate collision raised by the idx_active_plate partial
 * unique index. Detection belongs here because the driver error code is a persistence
 * detail; deciding that it means HTTP 409 belongs to the service.
 */
export const isUniqueActivePlateViolation = (error) =>
  error?.code === POSTGRES_UNIQUE_VIOLATION && error?.constraint === ACTIVE_PLATE_INDEX_NAME;

export const parkingRepository = createParkingRepository();
