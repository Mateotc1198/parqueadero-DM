/**
 * Wraps an asynchronous route handler so a rejected promise reaches the error middleware.
 *
 * Express 4 does not await handlers. When one rejects and nothing catches the rejection,
 * the request never gets a response: the client waits until it times out while Node reports
 * an unhandled rejection on the server. This wrapper is what removes the try/catch that
 * would otherwise have to be repeated in every single controller.
 *
 * A synchronous throw needs no wrapping, because Express already catches those itself.
 */
export const asyncHandler = (handler) => (request, response, next) =>
  Promise.resolve(handler(request, response, next)).catch(next);
