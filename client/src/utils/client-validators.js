import { LABELS } from "../constants/labels.js";

/**
 * Optional checks the forms run before sending anything.
 *
 * These exist for the user's sake, not for the system's: they turn a round trip to the
 * server into instant feedback under the field. The backend validates the very same rules
 * and is the only authority. Deleting this file would change the experience, never the
 * correctness, which is exactly the property client side validation should have.
 *
 * The patterns are duplicated from the server on purpose. Sharing them would mean shipping
 * server code to the browser, and the duplication is two lines that the API re-checks on
 * every request anyway.
 */

const CAR_PLATE_PATTERN = /^[A-Z]{3}[0-9]{3}$/;
const MOTORCYCLE_PLATE_PATTERN = /^[A-Z]{3}[0-9]{2}[A-Z]$/;

const PLATE_PATTERNS_BY_VEHICLE_TYPE = Object.freeze({
  CAR: CAR_PLATE_PATTERN,
  TRUCK: CAR_PLATE_PATTERN,
  MOTORCYCLE: MOTORCYCLE_PLATE_PATTERN,
});

/** Returns the message to show under the field, or null when the value is acceptable. */
export const validatePlate = (plate, vehicleType) => {
  const normalizedPlate = String(plate ?? "").trim();

  if (normalizedPlate === "") {
    return LABELS.ERRORS.PLATE_REQUIRED;
  }

  const pattern = PLATE_PATTERNS_BY_VEHICLE_TYPE[vehicleType];

  // Without a vehicle type there is no way to know which pattern applies, so either is
  // accepted and the server has the final word.
  const isValid = pattern
    ? pattern.test(normalizedPlate)
    : CAR_PLATE_PATTERN.test(normalizedPlate) || MOTORCYCLE_PLATE_PATTERN.test(normalizedPlate);

  return isValid ? null : LABELS.ERRORS.PLATE_INVALID_FORMAT;
};

export const validateVehicleTypeSelection = (vehicleType) =>
  String(vehicleType ?? "").trim() === "" ? LABELS.ERRORS.VEHICLE_TYPE_REQUIRED : null;
