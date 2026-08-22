import pg from "pg";

import { envConfig } from "./env-config.js";

const { Pool } = pg;

const APPLICATION_NAME = "parking-system-server";
const HEALTH_CHECK_QUERY = "SELECT 1";
const NANOSECONDS_PER_MILLISECOND = 1e6;

const pool = new Pool({
  host: envConfig.database.host,
  port: envConfig.database.port,
  database: envConfig.database.name,
  user: envConfig.database.user,
  password: envConfig.database.password,
  max: envConfig.database.poolMax,
  idleTimeoutMillis: envConfig.database.idleTimeoutMs,
  connectionTimeoutMillis: envConfig.database.connectionTimeoutMs,
  application_name: APPLICATION_NAME,
});

let isPoolClosed = false;

// An error raised by an idle client is emitted on the pool, not on a query promise.
// Without this listener Node treats it as an unhandled "error" event and kills the process.
pool.on("error", (error) => {
  console.error("Unexpected error on an idle PostgreSQL client:", error.message);
});

/**
 * Runs a single parameterized statement outside of an explicit transaction.
 * Parameters are always sent separately from the SQL text, never interpolated,
 * which is what keeps the repositories free of SQL injection.
 */
export const query = (text, parameters = []) => pool.query(text, parameters);

/**
 * Runs the callback inside a transaction and hands it a dedicated client.
 * Commits when the callback resolves and rolls back when it rejects, always
 * releasing the client back to the pool.
 */
export const withTransaction = async (callback) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      // Swallowing this would hide the original failure, so it is logged instead.
      console.error("Failed to roll back the transaction:", rollbackError.message);
    }

    throw error;
  } finally {
    client.release();
  }
};

/**
 * Reports whether the database answers. The driver error is logged on the server
 * and never returned, because it can expose the host, user or database name.
 */
export const checkDatabaseHealth = async () => {
  const startedAt = process.hrtime.bigint();

  try {
    await query(HEALTH_CHECK_QUERY);
    const elapsedNanoseconds = Number(process.hrtime.bigint() - startedAt);

    return {
      isConnected: true,
      latencyMs: Math.round((elapsedNanoseconds / NANOSECONDS_PER_MILLISECOND) * 100) / 100,
    };
  } catch (error) {
    console.error("Database health check failed:", error.message);

    return { isConnected: false, latencyMs: null };
  }
};

/**
 * Closes every pooled connection. Safe to call more than once, which matters
 * because SIGINT and SIGTERM can both arrive during the same shutdown.
 */
export const closePool = async () => {
  if (isPoolClosed) {
    return;
  }

  isPoolClosed = true;
  await pool.end();
};
