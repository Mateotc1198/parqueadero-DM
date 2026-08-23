/**
 * Date and duration formatting in the es-CO locale.
 *
 * The API sends every instant as an ISO string in UTC, and Intl renders it in the timezone
 * of whoever is looking at the screen. Nothing here parses a date by hand.
 *
 * The unit symbols are local constants rather than labels: "h" and "min" are unit
 * abbreviations, identical in Spanish and in English, so they are not translatable text.
 */

const EMPTY_VALUE = "—";
const HOURS_SYMBOL = "h";
const MINUTES_SYMBOL = "min";
const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "short",
  timeStyle: "short",
});

export const formatDateTime = (isoString) => {
  if (!isoString) {
    return EMPTY_VALUE;
  }

  const date = new Date(isoString);

  return Number.isNaN(date.getTime()) ? EMPTY_VALUE : DATE_TIME_FORMATTER.format(date);
};

/** Renders "1 h 30 min" from the breakdown the billing service already produced. */
export const formatDuration = (stayDuration) => {
  // Destructuring a null argument would throw, and a null breakdown is what a caller gets
  // for a ticket that has not been closed yet.
  const { hours, minutes } = stayDuration ?? {};

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return EMPTY_VALUE;
  }

  return `${hours} ${HOURS_SYMBOL} ${minutes} ${MINUTES_SYMBOL}`;
};

/**
 * Time a vehicle has been inside, for the parked list.
 *
 * This is presentation only. The stay that gets billed is always the one the server
 * computed at the moment of the exit, never this number.
 */
export const formatElapsedSince = (isoString) => {
  if (!isoString) {
    return EMPTY_VALUE;
  }

  const startedAt = new Date(isoString).getTime();

  if (Number.isNaN(startedAt)) {
    return EMPTY_VALUE;
  }

  const elapsedMinutes = Math.max(Math.floor((Date.now() - startedAt) / MILLISECONDS_PER_MINUTE), 0);

  return formatDuration({
    hours: Math.floor(elapsedMinutes / MINUTES_PER_HOUR),
    minutes: elapsedMinutes % MINUTES_PER_HOUR,
  });
};
