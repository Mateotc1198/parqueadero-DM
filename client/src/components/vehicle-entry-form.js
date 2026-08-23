import { LABELS } from "../constants/labels.js";
import { validatePlate, validateVehicleTypeSelection } from "../utils/client-validators.js";
import { createElement, selectElement, setHidden } from "../utils/dom.js";
import { applyPlateFormatting } from "../utils/plate-formatter.js";

/**
 * Entry form.
 *
 * It owns its own fields and nothing else: it never calls the API, and it reports a
 * submission upwards through onSubmit. Whoever wired it decides what that means.
 */
export const createVehicleEntryForm = ({ onSubmit }) => {
  const form = selectElement("#entry-form");
  const plateInput = selectElement("#entry-plate");
  const vehicleTypeSelect = selectElement("#entry-vehicle-type");
  const submitButton = selectElement("#entry-submit");
  const plateError = selectElement("#entry-plate-error");
  const vehicleTypeError = selectElement("#entry-vehicle-type-error");
  const blockedNotice = selectElement("#entry-blocked-notice");

  let isParkingLotFull = false;
  let isSubmitting = false;

  const showFieldError = (errorElement, inputElement, message) => {
    errorElement.textContent = message ?? "";
    setHidden(errorElement, !message);
    inputElement.setAttribute("aria-invalid", message ? "true" : "false");
  };

  const clearFieldErrors = () => {
    showFieldError(plateError, plateInput, null);
    showFieldError(vehicleTypeError, vehicleTypeSelect, null);
  };

  /**
   * The button is disabled while a request is in flight, while the lot is full, and while a
   * required field is empty. A badly formatted plate does not disable it: blocking the
   * button with no explanation is worse than letting the submit run and showing why.
   */
  const refreshSubmitState = () => {
    const hasEmptyField = plateInput.value.trim() === "" || vehicleTypeSelect.value === "";

    submitButton.disabled = isSubmitting || isParkingLotFull || hasEmptyField;
    submitButton.textContent = isSubmitting ? LABELS.ENTRY_FORM.SUBMITTING : LABELS.ENTRY_FORM.SUBMIT;
    setHidden(blockedNotice, !isParkingLotFull);
  };

  const validateForm = () => {
    const vehicleTypeMessage = validateVehicleTypeSelection(vehicleTypeSelect.value);
    const plateMessage = validatePlate(plateInput.value, vehicleTypeSelect.value);

    showFieldError(plateError, plateInput, plateMessage);
    showFieldError(vehicleTypeError, vehicleTypeSelect, vehicleTypeMessage);

    return !plateMessage && !vehicleTypeMessage;
  };

  plateInput.addEventListener("input", () => {
    applyPlateFormatting(plateInput);
    showFieldError(plateError, plateInput, null);
    refreshSubmitState();
  });

  // Validated on blur rather than on every keystroke, so a half typed plate is not marked
  // as wrong while the user is still typing it.
  plateInput.addEventListener("blur", () => {
    if (plateInput.value.trim() !== "") {
      showFieldError(plateError, plateInput, validatePlate(plateInput.value, vehicleTypeSelect.value));
    }
  });

  vehicleTypeSelect.addEventListener("change", () => {
    showFieldError(vehicleTypeError, vehicleTypeSelect, null);
    refreshSubmitState();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    onSubmit({ plate: plateInput.value, vehicleType: vehicleTypeSelect.value });
  });

  refreshSubmitState();

  return {
    /** Fills the select with the catalog, keeping the placeholder option in place. */
    setVehicleTypes(vehicleTypes) {
      const placeholderOption = vehicleTypeSelect.querySelector("option[value='']");

      vehicleTypeSelect.replaceChildren(placeholderOption);

      for (const { code, description } of vehicleTypes) {
        // The Spanish description comes from the catalog, so the client maps nothing.
        vehicleTypeSelect.append(createElement("option", { text: description, attributes: { value: code } }));
      }

      refreshSubmitState();
    },

    setParkingLotFull(isFull) {
      isParkingLotFull = isFull;
      refreshSubmitState();
    },

    setSubmitting(isBusy) {
      isSubmitting = isBusy;
      refreshSubmitState();
    },

    reset() {
      form.reset();
      clearFieldErrors();
      refreshSubmitState();
    },
  };
};
