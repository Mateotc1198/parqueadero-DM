import { LABELS } from "../constants/labels.js";
import { clearElement, createElement, selectElement } from "../utils/dom.js";

/**
 * The single place where the interface reports the outcome of an operation.
 *
 * The message it renders is always the one the API sent. The only wording that comes from
 * the client is in the cases where there was no API answer to show, and even then it
 * arrives already resolved inside the error.
 */

const SUCCESS_CLASS = "alert--success";
const ERROR_CLASS = "alert--error";
const CLOSE_SYMBOL = "×";

export const createAlertMessage = () => {
  const region = selectElement("#alert-region");

  const clear = () => clearElement(region);

  const render = (variantClass, message, errors) => {
    const content = createElement("div", { className: "alert__content" });
    content.append(createElement("p", { className: "alert__message", text: message }));

    // A validation failure carries the full list of problems, one per line, instead of
    // making the user resend the form to discover the next one.
    if (Array.isArray(errors) && errors.length > 0) {
      const list = createElement("ul", { className: "alert__list" });

      for (const error of errors) {
        list.append(createElement("li", { text: error }));
      }

      content.append(list);
    }

    const closeButton = createElement("button", {
      className: "alert__close",
      text: CLOSE_SYMBOL,
      attributes: { type: "button", "aria-label": LABELS.ALERT.CLOSE },
    });

    closeButton.addEventListener("click", clear);

    const alert = createElement("div", { className: `alert ${variantClass}` });
    alert.append(content, closeButton);

    region.replaceChildren(alert);
  };

  return {
    showSuccess: (message) => render(SUCCESS_CLASS, message),
    showError: (message, errors) => render(ERROR_CLASS, message, errors),
    clear,
  };
};
