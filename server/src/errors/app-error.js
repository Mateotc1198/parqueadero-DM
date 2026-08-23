import { HTTP_STATUS } from "../utils/api-response.js";

/**
 * Base class for every error the application raises deliberately.
 *
 * `isOperational` separates an expected business outcome (duplicate plate, full parking
 * lot, unknown vehicle) from a programming mistake or a raw driver failure. The error
 * middleware reads that flag to decide what reaches the client: operational errors return
 * their Spanish message, everything else returns the generic internal error. That is what
 * keeps a stack trace, a SQL fragment or a database identifier out of an HTTP response.
 */
export class AppError extends Error {
  constructor(message, { statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, errors = null } = {}) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;

    // Drops this constructor from the stack so the trace points at the real call site.
    Error.captureStackTrace(this, this.constructor);
  }
}

/** 400 - the input is missing, malformed or outside the allowed range. */
export class ValidationError extends AppError {
  constructor(message, errors = []) {
    super(message, { statusCode: HTTP_STATUS.BAD_REQUEST, errors });
  }
}

/** 404 - the requested resource does not exist. */
export class NotFoundError extends AppError {
  constructor(message) {
    super(message, { statusCode: HTTP_STATUS.NOT_FOUND });
  }
}

/** 409 - the request is well formed but collides with the current state of the system. */
export class ConflictError extends AppError {
  constructor(message) {
    super(message, { statusCode: HTTP_STATUS.CONFLICT });
  }
}

/** 422 - the syntax is correct but the values break a business invariant. */
export class UnprocessableEntityError extends AppError {
  constructor(message) {
    super(message, { statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY });
  }
}

/**
 * True only for errors this application raised on purpose. Anything else, including a
 * TypeError or a pg error that escaped a repository, is treated as unexpected.
 */
export const isOperationalError = (error) =>
  error instanceof AppError && error.isOperational === true;
