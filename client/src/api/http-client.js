import { API_BASE_URL, REQUEST_TIMEOUT_MS } from "../config.js";
import { LABELS } from "../constants/labels.js";

/**
 * Thin wrapper over fetch. It is the only place in the client that knows about HTTP.
 *
 * The rule it enforces is the one the interface depends on: when the API answers, the user
 * sees the message the API sent. The client only supplies wording of its own when there was
 * no answer at all to show, which is a network failure or a timeout.
 */

export class ApiError extends Error {
  constructor(message, { status = null, errors = [] } = {}) {
    super(message);

    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

const buildRequestOptions = (method, body, signal) => {
  const options = { method, signal };

  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }

  return options;
};

const request = async (path, { method = "GET", body } = {}) => {
  // fetch has no timeout of its own: without this the interface would keep a spinner turning
  // forever whenever the server stops answering.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, buildRequestOptions(method, body, controller.signal));
  } catch (error) {
    throw new ApiError(
      error.name === "AbortError" ? LABELS.ERRORS.REQUEST_TIMEOUT : LABELS.ERRORS.NETWORK_UNAVAILABLE,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  let payload;

  try {
    payload = await response.json();
  } catch {
    throw new ApiError(LABELS.ERRORS.UNEXPECTED_RESPONSE, { status: response.status });
  }

  if (!response.ok || payload?.success !== true) {
    // The API always answers with a Spanish message, so that message is what the user reads.
    throw new ApiError(payload?.message ?? LABELS.ERRORS.UNEXPECTED_RESPONSE, {
      status: response.status,
      errors: payload?.errors ?? [],
    });
  }

  return payload;
};

export const httpClient = Object.freeze({
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
});
