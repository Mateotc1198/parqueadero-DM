import { createApp } from "./app.js";
import { closePool } from "./config/database.js";
import { envConfig } from "./config/env-config.js";

/**
 * HTTP entry point and process lifecycle.
 *
 * Building the application belongs to app.js. This file binds it to a port and owns what
 * happens around the process itself: the signals that ask it to stop, and the two events
 * that mean something escaped every handler in the application.
 */

/** Upper bound for a graceful shutdown before the process is terminated anyway. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

const app = createApp();

const server = app.listen(envConfig.server.port, () => {
  console.log(
    `Parking system API listening on port ${envConfig.server.port} (${envConfig.nodeEnv})`,
  );
});

let isShuttingDown = false;

/**
 * Stops accepting new connections, lets the in-flight ones finish, and closes the
 * PostgreSQL pool before exiting.
 *
 * A client holding a keep-alive connection can keep server.close() from ever calling back,
 * so a timer guarantees the process terminates instead of hanging forever. The timer is
 * unref'd so it never keeps an otherwise idle process alive.
 */
const shutdown = (reason, exitCode) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Shutting down: ${reason}`);

  const forcedExit = setTimeout(() => {
    console.error(`Graceful shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms, forcing exit`);
    process.exit(EXIT_FAILURE);
  }, SHUTDOWN_TIMEOUT_MS);

  forcedExit.unref();

  server.close(async () => {
    try {
      await closePool();
      console.log("PostgreSQL pool closed");
      process.exit(exitCode);
    } catch (error) {
      console.error("Failed to close the PostgreSQL pool:", error.message);
      process.exit(EXIT_FAILURE);
    }
  });
};

process.on("SIGINT", () => shutdown("SIGINT received", EXIT_SUCCESS));
process.on("SIGTERM", () => shutdown("SIGTERM received", EXIT_SUCCESS));

/**
 * These two are the last line of defence, not a replacement for handling errors.
 *
 * An error raised while serving a request never reaches here: the error middleware answers
 * it and the server keeps running. Reaching this point means a failure escaped every
 * handler, so the process state can no longer be trusted. Logging it and shutting down
 * cleanly is the correct outcome: a supervisor restarts a healthy instance, while carrying
 * on would serve requests from a process in an undefined state.
 */
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
  shutdown("unhandled promise rejection", EXIT_FAILURE);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  shutdown("uncaught exception", EXIT_FAILURE);
});
