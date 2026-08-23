import { formatCurrency } from "../utils/currency-formatter.js";
import { formatDateTime, formatDuration } from "../utils/date-formatter.js";
import { selectElement, setHidden } from "../utils/dom.js";

/**
 * Receipt shown after a successful exit.
 *
 * Every figure is read from the response, never recomputed: the stay, the billable hours,
 * the rate and the total are what the server charged. A receipt that recalculated its own
 * total could disagree with the row stored in the database.
 */
export const createPaymentReceipt = ({ onClose } = {}) => {
  const panel = selectElement("#receipt-panel");
  const closeButton = selectElement("#receipt-close");
  const graceNotice = selectElement("#receipt-grace-notice");

  const fields = {
    plate: selectElement("#receipt-plate"),
    vehicleType: selectElement("#receipt-vehicle-type"),
    entryTime: selectElement("#receipt-entry-time"),
    exitTime: selectElement("#receipt-exit-time"),
    stay: selectElement("#receipt-stay"),
    billableHours: selectElement("#receipt-billable-hours"),
    hourlyRate: selectElement("#receipt-hourly-rate"),
    total: selectElement("#receipt-total"),
  };

  const hide = () => setHidden(panel, true);

  closeButton.addEventListener("click", () => {
    hide();
    onClose?.();
  });

  return {
    show(receipt) {
      fields.plate.textContent = receipt.plate;
      fields.vehicleType.textContent = receipt.vehicleTypeDescription ?? receipt.vehicleType;
      fields.entryTime.textContent = formatDateTime(receipt.entryTime);
      fields.exitTime.textContent = formatDateTime(receipt.exitTime);
      fields.stay.textContent = formatDuration(receipt.billing.stayDuration);
      fields.billableHours.textContent = String(receipt.billing.billableHours);
      fields.hourlyRate.textContent = formatCurrency(receipt.billing.hourlyRate);
      fields.total.textContent = formatCurrency(receipt.totalAmount);

      setHidden(graceNotice, !receipt.billing.isWithinGracePeriod);
      setHidden(panel, false);

      // A receipt that appears below the fold would go unnoticed on a small screen.
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    },

    hide,
  };
};
