/**
 * Domain model for parking records and vehicle types.
 *
 * PostgreSQL speaks snake_case and the pg driver returns NUMERIC columns as strings,
 * because it refuses to silently lose precision. Every row that leaves the repository
 * is mapped here, so no other layer ever sees a database shaped object.
 *
 * These functions are pure: no I/O, no validation, no business rules.
 */

export const PARKING_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  CLOSED: "CLOSED",
});

/**
 * Mirrors the rows seeded in the vehicle_types table.
 *
 * The catalog lives in the database, but the input validator needs a synchronous check
 * that works without a connection, otherwise validation would become asynchronous and
 * the service tests could not run against a fake repository. This constant is the fast
 * check with a clear message; the foreign key on parking_records.vehicle_type remains
 * the ultimate guarantee. Keep it in sync with database/seed.sql.
 */
export const VEHICLE_TYPE_CODES = Object.freeze(["CAR", "MOTORCYCLE", "TRUCK"]);

const toNullableNumber = (value) => (value === null || value === undefined ? null : Number(value));

const toIsoString = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/**
 * Maps a parking_records row. Returns null when the row is missing, which lets the
 * repository express "not found" without the caller inspecting arrays.
 */
export const toParkingRecord = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    plate: row.plate,
    vehicleType: row.vehicle_type,
    entryTime: toIsoString(row.entry_time),
    exitTime: toIsoString(row.exit_time),
    stayMinutes: toNullableNumber(row.stay_minutes),
    totalAmount: toNullableNumber(row.total_amount),
    status: row.status,
    createdAt: toIsoString(row.created_at),
  };
};

export const toParkingRecordList = (rows) => rows.map((row) => toParkingRecord(row));

export const toVehicleType = (row) => {
  if (!row) {
    return null;
  }

  return {
    code: row.code,
    description: row.description,
    hourlyRate: Number(row.hourly_rate),
  };
};

export const toVehicleTypeList = (rows) => rows.map((row) => toVehicleType(row));
