/**
 * Client configuration.
 *
 * The API base URL is relative on purpose. The browser resolves it against the origin the
 * page was loaded from, so the same file works on localhost, on a LAN address or on a real
 * server without a single change, and cross origin requests never enter the normal flow.
 *
 * There is no .env here: without a build step an environment variable cannot reach a
 * browser, so a constant in source is the honest way to express this.
 */

export const API_BASE_URL = "/api/v1";

/** A request that has not answered by then is treated as a failure instead of hanging. */
export const REQUEST_TIMEOUT_MS = 10_000;

/**
 * The screen also refreshes after every operation. This interval exists so the elapsed time
 * column and the occupancy stay honest on a screen nobody is touching, for instance one
 * mounted at the booth.
 */
export const REFRESH_INTERVAL_MS = 30_000;
