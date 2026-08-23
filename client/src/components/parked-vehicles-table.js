import { formatDateTime, formatElapsedSince } from "../utils/date-formatter.js";
import { clearElement, createElement, selectElement, setHidden } from "../utils/dom.js";

/**
 * Vehicles currently inside.
 *
 * The elapsed time column is presentation only: it is recomputed on every render from the
 * entry time, while the stay that gets billed is always the one the server calculated at
 * the moment of the exit.
 */
export const createParkedVehiclesTable = () => {
  const table = selectElement("#parked-table");
  const body = selectElement("#parked-table-body");
  const emptyState = selectElement("#parked-table-empty");

  /** Code to catalog description, so a row shows the readable name instead of "CAR". */
  let descriptionsByCode = new Map();

  const buildRow = (vehicle) => {
    const row = createElement("tr");

    row.append(
      createElement("td", { className: "table__plate", text: vehicle.plate }),
      createElement("td", { text: descriptionsByCode.get(vehicle.vehicleType) ?? vehicle.vehicleType }),
      createElement("td", { text: formatDateTime(vehicle.entryTime) }),
      createElement("td", { text: formatElapsedSince(vehicle.entryTime) }),
    );

    return row;
  };

  return {
    setVehicleTypes(vehicleTypes) {
      descriptionsByCode = new Map(vehicleTypes.map(({ code, description }) => [code, description]));
    },

    render(vehicles) {
      clearElement(body);

      const hasVehicles = vehicles.length > 0;

      // The headers are hidden along with the table so the empty state reads as a sentence
      // rather than as a broken grid.
      setHidden(table, !hasVehicles);
      setHidden(emptyState, hasVehicles);

      if (!hasVehicles) {
        return;
      }

      body.append(...vehicles.map((vehicle) => buildRow(vehicle)));
    },
  };
};
