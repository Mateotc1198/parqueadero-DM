import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

const SERVER_ROOT_DIRECTORY = path.resolve(import.meta.dirname, "..", "..");
const ENV_FILE_PATH = path.join(SERVER_ROOT_DIRECTORY, ".env");

const ALLOWED_NODE_ENVIRONMENTS = ["development", "test", "production"];
const MIN_PORT_NUMBER = 1;
const MAX_PORT_NUMBER = 65535;

// Variables whose value must never reach a log line or an error message.
const SENSITIVE_KEYS = new Set(["DB_PASSWORD"]);

if (!fs.existsSync(ENV_FILE_PATH)) {
  console.warn(
    `No .env file found at ${ENV_FILE_PATH}. Copy .env.example to .env before starting the server.`,
  );
}

dotenv.config({ path: ENV_FILE_PATH });

/**
 * Every problem found while reading the environment is accumulated here so the
 * process reports all of them at once instead of failing one variable at a time.
 */
const configurationErrors = [];

const describeValue = (key, value) => (SENSITIVE_KEYS.has(key) ? "********" : `"${value}"`);

const readRawValue = (key, defaultValue) => {
  const rawValue = process.env[key];

  if (rawValue === undefined || rawValue.trim() === "") {
    if (defaultValue !== undefined) {
      return String(defaultValue);
    }

    configurationErrors.push(`Missing required environment variable: ${key}`);
    return undefined;
  }

  return rawValue.trim();
};

const readString = (key, { defaultValue, allowedValues } = {}) => {
  const value = readRawValue(key, defaultValue);

  if (value === undefined) {
    return undefined;
  }

  if (allowedValues && !allowedValues.includes(value)) {
    configurationErrors.push(
      `Environment variable ${key} must be one of [${allowedValues.join(", ")}], received ${describeValue(key, value)}`,
    );
    return undefined;
  }

  return value;
};

const readInteger = (key, { defaultValue, minimum, maximum } = {}) => {
  const rawValue = readRawValue(key, defaultValue);

  if (rawValue === undefined) {
    return undefined;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isInteger(parsedValue)) {
    configurationErrors.push(
      `Environment variable ${key} must be an integer, received ${describeValue(key, rawValue)}`,
    );
    return undefined;
  }

  if (minimum !== undefined && parsedValue < minimum) {
    configurationErrors.push(
      `Environment variable ${key} must be greater than or equal to ${minimum}, received ${parsedValue}`,
    );
    return undefined;
  }

  if (maximum !== undefined && parsedValue > maximum) {
    configurationErrors.push(
      `Environment variable ${key} must be lower than or equal to ${maximum}, received ${parsedValue}`,
    );
    return undefined;
  }

  return parsedValue;
};

const readOriginList = (key, { defaultValue } = {}) => {
  const rawValue = readRawValue(key, defaultValue);

  if (rawValue === undefined) {
    return undefined;
  }

  const origins = rawValue
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    configurationErrors.push(`Environment variable ${key} must contain at least one origin`);
    return undefined;
  }

  return Object.freeze(origins);
};

const nodeEnv = readString("NODE_ENV", {
  defaultValue: "development",
  allowedValues: ALLOWED_NODE_ENVIRONMENTS,
});

const serverConfig = {
  port: readInteger("PORT", {
    defaultValue: 3000,
    minimum: MIN_PORT_NUMBER,
    maximum: MAX_PORT_NUMBER,
  }),
  corsOrigins: readOriginList("CORS_ORIGIN", { defaultValue: "http://localhost:5173" }),
};

const databaseConfig = {
  host: readString("DB_HOST", { defaultValue: "localhost" }),
  port: readInteger("DB_PORT", {
    defaultValue: 5432,
    minimum: MIN_PORT_NUMBER,
    maximum: MAX_PORT_NUMBER,
  }),
  name: readString("DB_NAME"),
  user: readString("DB_USER"),
  password: readString("DB_PASSWORD"),
  poolMax: readInteger("DB_POOL_MAX", { defaultValue: 10, minimum: 1, maximum: 100 }),
  idleTimeoutMs: readInteger("DB_IDLE_TIMEOUT_MS", { defaultValue: 30000, minimum: 0 }),
  connectionTimeoutMs: readInteger("DB_CONNECTION_TIMEOUT_MS", { defaultValue: 5000, minimum: 0 }),
};

const parkingEnvironment = {
  capacity: readInteger("PARKING_CAPACITY", { defaultValue: 50, minimum: 1 }),
  gracePeriodMinutes: readInteger("GRACE_PERIOD_MINUTES", { defaultValue: 10, minimum: 0 }),
};

if (configurationErrors.length > 0) {
  throw new Error(
    `Invalid environment configuration:\n  - ${configurationErrors.join("\n  - ")}\n\nCheck server/.env against server/.env.example.`,
  );
}

export const envConfig = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === "production",
  isTest: nodeEnv === "test",
  server: Object.freeze(serverConfig),
  database: Object.freeze(databaseConfig),
  parking: Object.freeze(parkingEnvironment),
});
