import { ERROR_MESSAGES } from "../constants/messages.js";
import { ValidationError } from "../errors/app-error.js";
import { VEHICLE_TYPE_CODES } from "../models/parking-record.js";

/**
 * Input validation for every parking endpoint.
 *
 * Two rules govern this module:
 *   - Errors are accumulated, never short circuited. A caller gets the full list of what
 *     is wrong with the payload in a single response instead of fixing one field per round trip.
 *   - Validated values come back normalized, so the service layer receives clean data and
 *     never repeats a trim, an uppercase or a date parse.
 */

const CAR_PLATE_PATTERN = /^[A-Z]{3}[0-9]{3}$/;
const MOTORCYCLE_PLATE_PATTERN = /^[A-Z]{3}[0-9]{2}[A-Z]$/;

const PLATE_PATTERNS_BY_VEHICLE_TYPE = Object.freeze({
  CAR: CAR_PLATE_PATTERN,
  TRUCK: CAR_PLATE_PATTERN,
  MOTORCYCLE: MOTORCYCLE_PLATE_PATTERN,
});

/**
 * ISO 8601 with a mandatory timezone designator.
 *
 * Without a "Z" or an offset, JavaScript reads the string as the server local time, so the
 * very same text would mean two different instants for a client and a server in different
 * zones, while the underlying column is TIMESTAMPTZ. Requiring it costs nothing in
 * practice: `new Date().toISOString()` always emits "Z".
 */
const ISO_DATE_TIME_PATTERN =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2})(?::(?<second>\d{2})(?:\.\d{1,6})?)?(?<zone>Z|[+-]\d{2}:\d{2})$/;

/** Detects a date that looks ISO but carries no zone, to report the precise reason. */
const ISO_DATE_TIME_WITHOUT_ZONE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Tolerates a client whose clock runs slightly ahead of the server. */
const CLOCK_SKEW_TOLERANCE_MS = 60_000;

const DAYS_PER_MONTH = Object.freeze([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);

const MAX_HOUR = 23;
const MAX_MINUTE = 59;
const MAX_SECOND = 59;

const isLeapYear = (year) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const getDaysInMonth = (year, month) =>
  month === 2 && isLeapYear(year) ? 29 : DAYS_PER_MONTH[month - 1];

/**
 * Date.parse cannot be trusted as a calendar check: V8 silently rolls 2026-02-31 over to
 * March 3rd and 2025-02-29 to March 1st, so an impossible date would be stored as a
 * different, perfectly valid one. Every field is therefore range checked here.
 */
const isValidCalendarInstant = ({ year, month, day, hour, minute, second }) => {
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);

  if (monthNumber < 1 || monthNumber > 12) {
    return false;
  }

  if (dayNumber < 1 || dayNumber > getDaysInMonth(yearNumber, monthNumber)) {
    return false;
  }

  return (
    Number(hour) <= MAX_HOUR &&
    Number(minute) <= MAX_MINUTE &&
    Number(second ?? "00") <= MAX_SECOND
  );
};

const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Treats undefined, null and a blank string as "the field was not sent". */
const isMissing = (value) =>
  value === undefined || value === null || (typeof value === "string" && value.trim() === "");

const normalizeCode = (value) => (typeof value === "string" ? value.trim().toUpperCase() : null);

/**
 * The plate pattern depends on the vehicle type, so the raw type is inspected here.
 *
 * When the type is missing or invalid there is no way to know which pattern applies, and
 * assuming one would report a phantom plate error while the real problem is the type.
 * In that case the plate is checked against the union of both patterns.
 */
const validatePlateValue = (plate, rawVehicleType, errors) => {
  if (isMissing(plate)) {
    errors.push(ERROR_MESSAGES.PLATE_REQUIRED);
    return null;
  }

  if (typeof plate !== "string") {
    errors.push(ERROR_MESSAGES.PLATE_INVALID_FORMAT);
    return null;
  }

  const normalizedPlate = plate.trim().toUpperCase();
  const pattern = PLATE_PATTERNS_BY_VEHICLE_TYPE[normalizeCode(rawVehicleType)];

  const isValidPlate = pattern
    ? pattern.test(normalizedPlate)
    : CAR_PLATE_PATTERN.test(normalizedPlate) || MOTORCYCLE_PLATE_PATTERN.test(normalizedPlate);

  if (!isValidPlate) {
    errors.push(ERROR_MESSAGES.PLATE_INVALID_FORMAT);
    return null;
  }

  return normalizedPlate;
};

const validateVehicleTypeValue = (vehicleType, errors) => {
  if (isMissing(vehicleType)) {
    errors.push(ERROR_MESSAGES.VEHICLE_TYPE_REQUIRED);
    return null;
  }

  const normalizedVehicleType = normalizeCode(vehicleType);

  if (normalizedVehicleType === null || !VEHICLE_TYPE_CODES.includes(normalizedVehicleType)) {
    errors.push(ERROR_MESSAGES.VEHICLE_TYPE_INVALID);
    return null;
  }

  return normalizedVehicleType;
};

/**
 * Returns a Date when the field was sent and is valid, or null when it was omitted.
 * Omitting it is legal: the service defaults it to the current time.
 */
const validateOptionalDateTime = (value, errors) => {
  if (isMissing(value)) {
    return null;
  }

  if (typeof value !== "string") {
    errors.push(ERROR_MESSAGES.INVALID_DATE);
    return null;
  }

  const trimmedValue = value.trim();
  const match = ISO_DATE_TIME_PATTERN.exec(trimmedValue);

  if (!match) {
    errors.push(
      ISO_DATE_TIME_WITHOUT_ZONE_PATTERN.test(trimmedValue)
        ? ERROR_MESSAGES.DATE_TIMEZONE_REQUIRED
        : ERROR_MESSAGES.INVALID_DATE,
    );
    return null;
  }

  // The pattern accepts a shape, not a calendar: 2026-02-31 and 2026-13-01 reach this line.
  if (!isValidCalendarInstant(match.groups)) {
    errors.push(ERROR_MESSAGES.INVALID_DATE);
    return null;
  }

  const parsedDate = new Date(trimmedValue);

  // Backstop for anything the field checks above cannot catch, such as a +99:00 offset.
  if (Number.isNaN(parsedDate.getTime())) {
    errors.push(ERROR_MESSAGES.INVALID_DATE);
    return null;
  }

  if (parsedDate.getTime() > Date.now() + CLOCK_SKEW_TOLERANCE_MS) {
    errors.push(ERROR_MESSAGES.FUTURE_DATE);
    return null;
  }

  return parsedDate;
};

/**
 * Rejects NaN, Infinity, decimals, negatives, booleans, arrays and unparseable strings.
 * Query string values always arrive as text, so Number() is the single conversion point.
 */
const validateOptionalInteger = (value, { minimum, message = ERROR_MESSAGES.INVALID_NUMBER }, errors) => {
  if (isMissing(value)) {
    return null;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    errors.push(message);
    return null;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < minimum) {
    errors.push(message);
    return null;
  }

  return parsedValue;
};

const assertBodyIsPresent = (body) => {
  if (!isPlainObject(body) || Object.keys(body).length === 0) {
    throw new ValidationError(ERROR_MESSAGES.VALIDATION_FAILED, [ERROR_MESSAGES.BODY_REQUIRED]);
  }
};

const throwWhenInvalid = (errors) => {
  if (errors.length > 0) {
    throw new ValidationError(ERROR_MESSAGES.VALIDATION_FAILED, errors);
  }
};

/** POST /api/v1/vehicles/entry */
export const validateVehicleEntry = (body) => {
  assertBodyIsPresent(body);

  const errors = [];
  const plate = validatePlateValue(body.plate, body.vehicleType, errors);
  const vehicleType = validateVehicleTypeValue(body.vehicleType, errors);
  const entryTime = validateOptionalDateTime(body.entryTime, errors);

  throwWhenInvalid(errors);

  return { plate, vehicleType, entryTime };
};

/** POST /api/v1/vehicles/exit */
export const validateVehicleExit = (body) => {
  assertBodyIsPresent(body);

  const errors = [];
  // The exit payload carries no vehicle type, so the plate is matched against both patterns.
  const plate = validatePlateValue(body.plate, null, errors);
  const exitTime = validateOptionalDateTime(body.exitTime, errors);

  throwWhenInvalid(errors);

  return { plate, exitTime };
};

/** GET /api/v1/vehicles/:plate */
export const validatePlateParam = (plate) => {
  const errors = [];
  const normalizedPlate = validatePlateValue(plate, null, errors);

  throwWhenInvalid(errors);

  return normalizedPlate;
};

/**
 * GET /api/v1/parking/history
 *
 * Only shape and sign are checked here. The upper bound is a persistence concern and
 * stays in the repository, which caps the limit before it reaches the SQL statement.
 */
export const validateHistoryQuery = (query = {}) => {
  const errors = [];

  const limit = validateOptionalInteger(
    query.limit,
    { minimum: 1, message: ERROR_MESSAGES.LIMIT_INVALID },
    errors,
  );

  const offset = validateOptionalInteger(
    query.offset,
    { minimum: 0, message: ERROR_MESSAGES.OFFSET_INVALID },
    errors,
  );

  throwWhenInvalid(errors);

  return { limit, offset };
};
