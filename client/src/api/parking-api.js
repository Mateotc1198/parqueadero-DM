import { httpClient } from "./http-client.js";

/**
 * One function per endpoint. Components call these and never touch fetch, a URL or a
 * status code: components -> api -> http-client, and nothing skips a level.
 *
 * Every function returns the whole envelope, not just `data`, because the interface shows
 * the `message` the API sent rather than one of its own.
 */
export const parkingApi = Object.freeze({
  getVehicleTypes: () => httpClient.get("/vehicle-types"),

  getAvailability: () => httpClient.get("/parking/availability"),

  getParkedVehicles: () => httpClient.get("/vehicles/parked"),

  // encodeURIComponent keeps a plate with an unexpected character from altering the path.
  getVehicleByPlate: (plate) => httpClient.get(`/vehicles/${encodeURIComponent(plate)}`),

  getHistory: ({ limit, offset } = {}) => {
    const query = new URLSearchParams();

    if (limit !== undefined) {
      query.set("limit", String(limit));
    }

    if (offset !== undefined) {
      query.set("offset", String(offset));
    }

    const queryString = query.toString();

    return httpClient.get(`/parking/history${queryString ? `?${queryString}` : ""}`);
  },

  registerEntry: ({ plate, vehicleType, entryTime }) =>
    httpClient.post("/vehicles/entry", { plate, vehicleType, entryTime }),

  registerExit: ({ plate, exitTime }) => httpClient.post("/vehicles/exit", { plate, exitTime }),
});
