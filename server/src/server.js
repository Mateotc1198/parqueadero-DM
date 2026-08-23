import { createApp } from "./app.js";
import { envConfig } from "./config/env-config.js";

/**
 * HTTP entry point.
 *
 * Kept deliberately small: building the application belongs to app.js, and this file only
 * binds it to a port. Phase 7 adds the global exception hooks and the graceful shutdown
 * that closes the connection pool.
 */
const app = createApp();

app.listen(envConfig.server.port, () => {
  console.log(
    `Parking system API listening on port ${envConfig.server.port} (${envConfig.nodeEnv})`,
  );
});
