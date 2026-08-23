import { ERROR_MESSAGES } from "../constants/messages.js";
import { isOperationalError } from "../errors/app-error.js";
import { HTTP_STATUS, buildErrorResponse } from "../utils/api-response.js";

/**
 * Failures raised by express.json() before any controller runs. They are not application
 * errors, so they carry a `type` instead of a status code of ours.
 */
const BODY_PARSER_FAILURES = Object.freeze({
  "entity.parse.failed": {
    statusCode: HTTP_STATUS.BAD_REQUEST,
    message: ERROR_MESSAGES.VALIDATION_FAILED,
    errors: [ERROR_MESSAGES.MALFORMED_JSON],
  },
  "entity.too.large": {
    statusCode: HTTP_STATUS.PAYLOAD_TOO_LARGE,
    message: ERROR_MESSAGES.PAYLOAD_TOO_LARGE,
    errors: null,
  },
});

/**
 * Single exit point for every failure in the application.
 *
 * The rule it enforces is the security one: an error this application raised on purpose
 * returns its Spanish message, and anything else returns a generic message while the real
 * cause is logged on the server. That is what keeps a stack trace, a SQL fragment or a
 * database identifier from ever reaching a client.
 *
 * Express identifies an error middleware by its arity, so all four parameters must stay
 * declared even when `next` is only used on one branch.
 */
// eslint-disable-next-line no-unused-vars
export const errorHandler = (error, request, response, next) => {
  // Once the response has begun there is no way to replace it with an error envelope.
  // Delegating to the Express default handler lets it close the connection instead of
  // throwing "Cannot set headers after they are sent" on top of the original failure.
  if (response.headersSent) {
    next(error);
    return;
  }

  const bodyParserFailure = BODY_PARSER_FAILURES[error?.type];

  if (bodyParserFailure) {
    response
      .status(bodyParserFailure.statusCode)
      .json(buildErrorResponse({
        message: bodyParserFailure.message,
        errors: bodyParserFailure.errors,
      }));
    return;
  }

  if (isOperationalError(error)) {
    response
      .status(error.statusCode)
      .json(buildErrorResponse({ message: error.message, errors: error.errors }));
    return;
  }

  console.error(`[${request.method} ${request.originalUrl}] Unhandled error:`, error);

  response
    .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    .json(buildErrorResponse({ message: ERROR_MESSAGES.INTERNAL_ERROR }));
};
