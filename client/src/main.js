import { parkingApi } from "./api/parking-api.js";
import { LABELS } from "./constants/labels.js";
import { applyLabels, selectElement } from "./utils/dom.js";

/**
 * Application entry point.
 *
 * At this stage it does two things: it writes every Spanish string of the markup from
 * labels.js, and it verifies the client can reach the API. The components that make the
 * page interactive arrive in the next phase and are wired from here.
 */

const renderConnectionNotice = (className, message) => {
  const alertRegion = selectElement("#alert-region");
  const alert = document.createElement("div");

  alert.className = `alert ${className}`;
  alert.textContent = message;
  alertRegion.replaceChildren(alert);
};

/**
 * Temporary boot check, replaced by the availability panel in the next phase. It exists so
 * this phase can be verified in a browser rather than only by reading the source.
 */
const verifyApiConnection = async () => {
  try {
    const { data } = await parkingApi.getAvailability();

    selectElement("#availability-capacity").textContent = String(data.capacity);
    selectElement("#availability-occupied").textContent = String(data.occupied);
    selectElement("#availability-available").textContent = String(data.available);

    renderConnectionNotice("alert--success", LABELS.COMMON.CONNECTION_VERIFIED);
  } catch (error) {
    // Never an error only in the console: whatever went wrong is shown on the page.
    renderConnectionNotice("alert--error", error.message);
  }
};

const startApplication = async () => {
  applyLabels();
  document.title = LABELS.PAGE_TITLE;

  await verifyApiConnection();
};

startApplication();
