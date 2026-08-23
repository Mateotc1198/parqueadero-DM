import { LABELS } from "../constants/labels.js";
import { validatePlate } from "../utils/client-validators.js";
import { selectElement, setHidden } from "../utils/dom.js";
import { applyPlateFormatting } from "../utils/plate-formatter.js";

/**
 * Exit form.
 *
 * It asks only for the plate: the vehicle type, the entry time and the amount all come from
 * the ticket the server already has. Asking the user to retype any of that would be an
 * invitation to contradict the stored record.
 */
export const createVehicleExitForm = ({ onSubmit }) => {
  const form = selectElement("#exit-form");
  const plateInput = selectElement("#exit-plate");
  const submitButton = selectElement("#exit-submit");
  const plateError = selectElement("#exit-plate-error");

  let isSubmitting = false;

  const showFieldError = (message) => {
    plateError.textContent = message ?? "";
    setHidden(plateError, !message);
    plateInput.setAttribute("aria-invalid", message ? "true" : "false");
  };

  const refreshSubmitState = () => {
    submitButton.disabled = isSubmitting || plateInput.value.trim() === "";
    submitButton.textContent = isSubmitting ? LABELS.EXIT_FORM.SUBMITTING : LABELS.EXIT_FORM.SUBMIT;
  };

  plateInput.addEventListener("input", () => {
    applyPlateFormatting(plateInput);
    showFieldError(null);
    refreshSubmitState();
  });

  plateInput.addEventListener("blur", () => {
    if (plateInput.value.trim() !== "") {
      showFieldError(validatePlate(plateInput.value));
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    // No vehicle type here, so the plate is accepted against either pattern and the server
    // has the final word.
    const plateMessage = validatePlate(plateInput.value);
    showFieldError(plateMessage);

    if (plateMessage) {
      return;
    }

    onSubmit({ plate: plateInput.value });
  });

  refreshSubmitState();

  return {
    setSubmitting(isBusy) {
      isSubmitting = isBusy;
      refreshSubmitState();
    },

    reset() {
      form.reset();
      showFieldError(null);
      refreshSubmitState();
    },
  };
};
