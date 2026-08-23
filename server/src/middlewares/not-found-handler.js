import { ERROR_MESSAGES } from "../constants/messages.js";
import { NotFoundError } from "../errors/app-error.js";

/**
 * Reached only when no route matched the request.
 *
 * It raises the domain error instead of answering directly, so every failure in the
 * application leaves through the same middleware. Answering here would create a second
 * place that builds a response, and the two shapes would eventually drift apart.
 *
 * Without this handler Express falls back to its own default, which returns an HTML error
 * page: any client expecting JSON breaks while trying to parse it.
 */
export const notFoundHandler = (request, response, next) => {
  next(new NotFoundError(ERROR_MESSAGES.ROUTE_NOT_FOUND));
};
