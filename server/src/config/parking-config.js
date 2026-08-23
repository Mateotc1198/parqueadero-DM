import { envConfig } from "./env-config.js";

/**
 * Operating policy of the parking lot, as a single frozen value.
 *
 * The parking service depends on this shape, never on the environment directly. That is
 * what lets a test run the service with a capacity of 1 to exercise the "full" rule
 * without touching environment variables or restarting the process.
 *
 * Wired into the service by the composition root in the routing layer.
 */
export const parkingConfig = Object.freeze({
  capacity: envConfig.parking.capacity,
  gracePeriodMinutes: envConfig.parking.gracePeriodMinutes,
});
