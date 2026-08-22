import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { checkDatabaseHealth, closePool, query, withTransaction } from "../config/database.js";

// Order matters: the schema must exist before the catalog rows are inserted.
const MIGRATION_FILE_NAMES = ["schema.sql", "seed.sql"];

const CONNECTION_ATTEMPTS = 5;
const CONNECTION_RETRY_DELAY_MS = 2000;

const CATALOG_QUERY = `
  SELECT code,
         description,
         hourly_rate::float8 AS hourly_rate
    FROM vehicle_types
   ORDER BY code
`;

/**
 * The container reports healthy a moment before it accepts connections, so the
 * runner retries instead of failing on a race the developer cannot control.
 */
const waitForDatabase = async () => {
  for (let attempt = 1; attempt <= CONNECTION_ATTEMPTS; attempt += 1) {
    const { isConnected } = await checkDatabaseHealth();

    if (isConnected) {
      console.log("Database connection established");
      return;
    }

    console.log(`Database is not ready yet (attempt ${attempt} of ${CONNECTION_ATTEMPTS})`);

    if (attempt < CONNECTION_ATTEMPTS) {
      await delay(CONNECTION_RETRY_DELAY_MS);
    }
  }

  throw new Error(
    `Database unreachable after ${CONNECTION_ATTEMPTS} attempts. Start it with: docker compose up -d`,
  );
};

/**
 * Applies one SQL file inside a single transaction. PostgreSQL supports transactional
 * DDL, so a failing statement leaves the schema exactly as it was before the run.
 */
const applyMigrationFile = async (fileName) => {
  const filePath = path.join(import.meta.dirname, fileName);
  const sqlScript = await fs.readFile(filePath, "utf8");

  await withTransaction((client) => client.query(sqlScript));

  console.log(`Applied ${fileName}`);
};

const reportCatalogState = async () => {
  const { rows } = await query(CATALOG_QUERY);

  console.log(`Vehicle types available: ${rows.length}`);

  rows.forEach((row) => {
    console.log(`  ${row.code.padEnd(12)} ${row.description.padEnd(14)} ${row.hourly_rate}`);
  });
};

const runMigrations = async () => {
  await waitForDatabase();

  for (const fileName of MIGRATION_FILE_NAMES) {
    await applyMigrationFile(fileName);
  }

  await reportCatalogState();
};

try {
  await runMigrations();
  console.log("Database migrations completed successfully");
} catch (error) {
  console.error("Database migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
