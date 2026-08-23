/**
 * Pure time helpers.
 *
 * No clock and no I/O live here: every instant arrives as a parameter. That is what lets
 * the billing service be tested without a database and without mocking Date.now().
 */

export const MINUTES_PER_HOUR = 60;
export const MILLISECONDS_PER_MINUTE = 60_000;

const toTimestamp = (value) => {
  const date = value instanceof Date ? value : new Date(value);

  return date.getTime();
};

/**
 * Whole minutes elapsed between two instants, truncated towards zero.
 *
 * Truncating is deliberate, because the billing service rounds hours up afterwards:
 * without it a stay of 60 minutes and 30 seconds would be read as 60.5 minutes and billed
 * as two hours instead of one. The stay_minutes column is INTEGER as well, so the seconds
 * would be discarded anyway.
 */
export const calculateStayMinutes = (entryTime, exitTime) => {
  const entryTimestamp = toTimestamp(entryTime);
  const exitTimestamp = toTimestamp(exitTime);

  if (Number.isNaN(entryTimestamp) || Number.isNaN(exitTimestamp)) {
    throw new TypeError("calculateStayMinutes requires two valid dates");
  }

  return Math.floor((exitTimestamp - entryTimestamp) / MILLISECONDS_PER_MINUTE);
};

/**
 * Splits a duration expressed in minutes into hours and remaining minutes, so the receipt
 * can show "1 h 30 min" next to the raw minute count.
 */
export const formatStayDuration = (stayMinutes) => {
  if (!Number.isInteger(stayMinutes) || stayMinutes < 0) {
    throw new TypeError("formatStayDuration requires a non negative integer of minutes");
  }

  return {
    hours: Math.floor(stayMinutes / MINUTES_PER_HOUR),
    minutes: stayMinutes % MINUTES_PER_HOUR,
  };
};
