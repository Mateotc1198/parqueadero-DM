import { selectElement, setHidden } from "../utils/dom.js";

/**
 * Occupancy of the parking lot.
 *
 * It computes nothing: capacity, occupied, available and isFull all arrive already
 * resolved from the API, which is the only place that knows the configured capacity.
 */
export const createAvailabilityPanel = () => {
  const capacityValue = selectElement("#availability-capacity");
  const occupiedValue = selectElement("#availability-occupied");
  const availableValue = selectElement("#availability-available");
  const fullBadge = selectElement("#availability-full-badge");

  return {
    update({ capacity, occupied, available, isFull }) {
      capacityValue.textContent = String(capacity);
      occupiedValue.textContent = String(occupied);
      availableValue.textContent = String(available);

      setHidden(fullBadge, !isFull);
    },
  };
};
