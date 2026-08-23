/**
 * Uniform response envelope for the whole API.
 *
 * Keys are always English so any client can rely on a stable contract; only the "message"
 * value is Spanish, because it is the single part a person actually reads.
 *
 * These are pure builders on purpose: they never touch the Express response object, which
 * keeps them framework agnostic and unit testable without faking a `res`.
 */

export const HTTP_STATUS = Object.freeze({
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
});

/**
 * { success: true, message: "...", data: { ... } }
 */
export const buildSuccessResponse = ({ message, data = null }) => ({
  success: true,
  message,
  data,
});

/**
 * { success: false, message: "...", errors: ["...", "..."] }
 *
 * The "errors" array is omitted when there is nothing to list, so a business rule failure
 * does not ship an empty array that a client might mistake for a validation problem.
 */
export const buildErrorResponse = ({ message, errors }) => {
  const response = {
    success: false,
    message,
  };

  if (Array.isArray(errors) && errors.length > 0) {
    response.errors = errors;
  }

  return response;
};
