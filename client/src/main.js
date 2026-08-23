import { parkingApi } from "./api/parking-api.js";
import { createAlertMessage } from "./components/alert-message.js";
import { createAvailabilityPanel } from "./components/availability-panel.js";
import { createParkedVehiclesTable } from "./components/parked-vehicles-table.js";
import { createPaymentReceipt } from "./components/payment-receipt.js";
import { createVehicleEntryForm } from "./components/vehicle-entry-form.js";
import { createVehicleExitForm } from "./components/vehicle-exit-form.js";
import { REFRESH_INTERVAL_MS } from "./config.js";
import { LABELS } from "./constants/labels.js";
import { applyLabels } from "./utils/dom.js";

/**
 * Composition root of the client.
 *
 * This is the only file that knows both the API and the components. Components report
 * upwards through callbacks and never fetch anything; the API layer never touches the DOM.
 *
 * All the state of the screen is this one object. A screen with three pieces of data does
 * not need a state library, and adding one would be complexity without a problem to solve.
 */
const state = {
  vehicleTypes: [],
  availability: null,
  parkedVehicles: [],
};

const alertMessage = createAlertMessage();
const availabilityPanel = createAvailabilityPanel();
const parkedVehiclesTable = createParkedVehiclesTable();
const paymentReceipt = createPaymentReceipt();

/**
 * Re-reads the state of the parking lot and pushes it into the components.
 *
 * Both requests go out at once because neither depends on the other; waiting for the first
 * to start the second would double the time the screen takes to update.
 */
const refreshParkingState = async () => {
  try {
    const [availabilityResponse, parkedResponse] = await Promise.all([
      parkingApi.getAvailability(),
      parkingApi.getParkedVehicles(),
    ]);

    state.availability = availabilityResponse.data;
    state.parkedVehicles = parkedResponse.data;

    availabilityPanel.update(state.availability);
    parkedVehiclesTable.render(state.parkedVehicles);
    entryForm.setParkingLotFull(state.availability.isFull);
  } catch (error) {
    // Never an error only in the console: if the screen is stale, the user is told why.
    alertMessage.showError(error.message, error.errors);
  }
};

const handleEntry = async ({ plate, vehicleType }) => {
  entryForm.setSubmitting(true);
  alertMessage.clear();
  paymentReceipt.hide();

  try {
    const { message } = await parkingApi.registerEntry({ plate, vehicleType });

    // The message shown is the one the API sent, never one written here.
    alertMessage.showSuccess(message);
    entryForm.reset();

    await refreshParkingState();
  } catch (error) {
    alertMessage.showError(error.message, error.errors);
  } finally {
    entryForm.setSubmitting(false);
  }
};

const handleExit = async ({ plate }) => {
  exitForm.setSubmitting(true);
  alertMessage.clear();

  try {
    const { message, data } = await parkingApi.registerExit({ plate });

    alertMessage.showSuccess(message);
    paymentReceipt.show(data);
    exitForm.reset();

    await refreshParkingState();
  } catch (error) {
    paymentReceipt.hide();
    alertMessage.showError(error.message, error.errors);
  } finally {
    exitForm.setSubmitting(false);
  }
};

const entryForm = createVehicleEntryForm({ onSubmit: handleEntry });
const exitForm = createVehicleExitForm({ onSubmit: handleExit });

const loadVehicleTypeCatalog = async () => {
  try {
    const { data } = await parkingApi.getVehicleTypes();

    state.vehicleTypes = data;
    entryForm.setVehicleTypes(state.vehicleTypes);
    parkedVehiclesTable.setVehicleTypes(state.vehicleTypes);
  } catch (error) {
    alertMessage.showError(error.message, error.errors);
  }
};

const startApplication = async () => {
  applyLabels();
  document.title = LABELS.PAGE_TITLE;

  await loadVehicleTypeCatalog();
  await refreshParkingState();

  // Keeps the elapsed time column and the occupancy honest on a screen nobody is touching.
  setInterval(refreshParkingState, REFRESH_INTERVAL_MS);
};

startApplication();
