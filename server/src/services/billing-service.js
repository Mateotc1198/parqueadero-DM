import { MINUTES_PER_HOUR, calculateStayMinutes, formatStayDuration } from "../utils/time-utils.js";

/**
 * Billing rules of the parking lot, as a pure function.
 *
 * It takes no dependency on the database, on the clock or on the vehicle catalog: the rate
 * and the grace period arrive as arguments. That is what makes every pricing rule testable
 * in isolation, which matters more here than anywhere else in the system, because this is
 * the code that decides what a person is charged.
 */

const CURRENCY_ROUNDING_FACTOR = 100;

/** Keeps the amount within the two decimals of the NUMERIC(10,2) column. */
const roundCurrency = (amount) =>
  Math.round(amount * CURRENCY_ROUNDING_FACTOR) / CURRENCY_ROUNDING_FACTOR;

const isValidDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);

  return !Number.isNaN(date.getTime());
};

const toTimestamp = (value) => (value instanceof Date ? value : new Date(value)).getTime();

/**
 * Every failure here is a programming mistake, not a user mistake, so these throw plain
 * errors instead of an AppError. The business rule "the exit cannot precede the entry" is
 * enforced by the parking service, which answers 422 before this function is ever reached.
 * Because they are not operational, the error middleware turns them into a generic 500,
 * which is the correct outcome for a bug.
 */
const assertValidArguments = ({ entryTime, exitTime, hourlyRate, graceMinutes }) => {
  if (!isValidDate(entryTime) || !isValidDate(exitTime)) {
    throw new TypeError("calculateBilling requires a valid entryTime and exitTime");
  }

  if (toTimestamp(exitTime) < toTimestamp(entryTime)) {
    throw new RangeError("calculateBilling requires exitTime to be greater than or equal to entryTime");
  }

  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
    throw new RangeError("calculateBilling requires a positive finite hourlyRate");
  }

  if (!Number.isInteger(graceMinutes) || graceMinutes < 0) {
    throw new RangeError("calculateBilling requires graceMinutes to be a non negative integer");
  }
};

/**
 * Rules applied, in order:
 *
 *   1. The stay is measured in whole minutes.
 *   2. A stay within the grace period is free. The rule is all or nothing: one minute past
 *      the grace period bills the full stay, the grace minutes are not subtracted.
 *   3. Any started hour counts as a full hour.
 *   4. The total is the billable hours times the hourly rate of the vehicle type.
 *
 * With a rate of 5000 and a grace period of 10 minutes:
 *   10 min -> 0        11 min -> 5000 (1 h)      70 min -> 10000 (2 h)
 */
export const calculateBilling = ({ entryTime, exitTime, hourlyRate, graceMinutes }) => {
  assertValidArguments({ entryTime, exitTime, hourlyRate, graceMinutes });

  const stayMinutes = calculateStayMinutes(entryTime, exitTime);
  const isWithinGracePeriod = stayMinutes <= graceMinutes;

  const billableHours = isWithinGracePeriod ? 0 : Math.ceil(stayMinutes / MINUTES_PER_HOUR);
  const totalAmount = roundCurrency(billableHours * hourlyRate);

  return Object.freeze({
    stayMinutes,
    stayDuration: Object.freeze(formatStayDuration(stayMinutes)),
    isWithinGracePeriod,
    billableHours,
    hourlyRate,
    graceMinutes,
    totalAmount,
  });
};
