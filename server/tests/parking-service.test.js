import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ERROR_MESSAGES } from "../src/constants/messages.js";
import { AppError } from "../src/errors/app-error.js";
import {
  PARKING_STATUS,
  VEHICLE_TYPE_CODES,
  toParkingRecord,
  toParkingRecordList,
  toVehicleType,
  toVehicleTypeList,
} from "../src/models/parking-record.js";
import { createParkingService } from "../src/services/parking-service.js";
import { HTTP_STATUS } from "../src/utils/api-response.js";

/**
 * The service receives its repository as an argument, so these tests run against an
 * in-memory double: no database, no connection pool and no environment variables.
 */

const MINUTE_MS = 60_000;

/**
 * Catalog fixture mirroring database/seed.sql. The Spanish text here is seeded data, the
 * same way it is in the database, and not an application message: those all live in
 * constants/messages.js and are imported, never written out.
 */
const VEHICLE_TYPES = [
  { code: "CAR", description: "Automóvil", hourlyRate: 5000 },
  { code: "MOTORCYCLE", description: "Motocicleta", hourlyRate: 2500 },
  { code: "TRUCK", description: "Camión", hourlyRate: 8000 },
];

const DEFAULT_CONFIG = { capacity: 50, gracePeriodMinutes: 10 };

/**
 * In-memory stand-in for the repository contract.
 *
 * `runInTransaction` is a single line because the real repository hands the callback another
 * repository rather than a pg client. That design decision is what makes this double possible.
 */
const createFakeRepository = ({ records = [], vehicleTypes = VEHICLE_TYPES, createFailsWith = null } = {}) => {
  const calls = [];
  let nextId = records.reduce((maximum, record) => Math.max(maximum, record.id), 0) + 1;

  const repository = {
    calls,
    records,

    lockParkingLot: async () => {
      calls.push("lockParkingLot");
    },

    findActiveRecordByPlate: async (plate) => {
      calls.push("findActiveRecordByPlate");
      return records.find((record) => record.plate === plate && record.status === "ACTIVE") ?? null;
    },

    countActiveRecords: async () => {
      calls.push("countActiveRecords");
      return records.filter((record) => record.status === "ACTIVE").length;
    },

    findActiveRecords: async () => records.filter((record) => record.status === "ACTIVE"),

    findAllRecords: async () => [...records],

    findAllVehicleTypes: async () => vehicleTypes,

    findVehicleTypeByCode: async (code) => vehicleTypes.find((type) => type.code === code) ?? null,

    createParkingRecord: async ({ plate, vehicleType, entryTime }) => {
      calls.push("createParkingRecord");

      if (createFailsWith) {
        throw createFailsWith;
      }

      const record = {
        id: nextId,
        plate,
        vehicleType,
        entryTime: entryTime.toISOString(),
        exitTime: null,
        stayMinutes: null,
        totalAmount: null,
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
      };

      nextId += 1;
      records.push(record);

      return { ...record };
    },

    closeParkingRecord: async ({ id, exitTime, stayMinutes, totalAmount }) => {
      calls.push("closeParkingRecord");

      const record = records.find((candidate) => candidate.id === id && candidate.status === "ACTIVE");

      if (!record) {
        return null;
      }

      Object.assign(record, {
        exitTime: exitTime.toISOString(),
        stayMinutes,
        totalAmount,
        status: "CLOSED",
      });

      return { ...record };
    },

    isUniqueActivePlateViolation: (error) =>
      error?.code === "23505" && error?.constraint === "idx_active_plate",

    runInTransaction: (callback) => callback(repository),
  };

  return repository;
};

const buildService = (repositoryOptions = {}, configOverrides = {}) => {
  const parkingRepository = createFakeRepository(repositoryOptions);
  const parkingService = createParkingService({
    parkingRepository,
    parkingConfig: { ...DEFAULT_CONFIG, ...configOverrides },
  });

  return { parkingService, parkingRepository };
};

const activeRecord = (overrides = {}) => ({
  id: 1,
  plate: "ABC123",
  vehicleType: "CAR",
  entryTime: new Date(Date.now() - 90 * MINUTE_MS).toISOString(),
  exitTime: null,
  stayMinutes: null,
  totalAmount: null,
  status: "ACTIVE",
  createdAt: new Date().toISOString(),
  ...overrides,
});

/** Runs an operation expected to fail and asserts the status code and message it carries. */
const expectFailure = async (run, { statusCode, message }) => {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof AppError, `expected an AppError, got ${error?.name}`);
    assert.equal(error.statusCode, statusCode);
    assert.equal(error.message, message);
    return error;
  }

  throw new assert.AssertionError({ message: "expected the operation to fail" });
};

describe("parking service", () => {
  describe("dependency contract", () => {
    it("refuses to be built without a repository and a configuration", () => {
      assert.throws(() => createParkingService(), TypeError);
      assert.throws(() => createParkingService({ parkingRepository: {} }), TypeError);
    });
  });

  describe("rule 1: a plate cannot be inside twice", () => {
    it("registers a valid entry", async () => {
      const { parkingService } = buildService();

      const created = await parkingService.registerEntry({ plate: "ABC123", vehicleType: "CAR" });

      assert.equal(created.plate, "ABC123");
      assert.equal(created.vehicleType, "CAR");
      assert.equal(created.status, "ACTIVE");
      assert.equal(created.exitTime, null);
      assert.equal(created.totalAmount, null);
    });

    it("defaults the entry time to the current instant when it is omitted", async () => {
      const { parkingService } = buildService();

      const created = await parkingService.registerEntry({ plate: "ABC123", vehicleType: "CAR" });

      assert.ok(Date.now() - new Date(created.entryTime).getTime() < 5000);
    });

    it("keeps the entry time when the caller provides one", async () => {
      const { parkingService } = buildService();
      const entryTime = new Date(Date.now() - 30 * MINUTE_MS);

      const created = await parkingService.registerEntry({
        plate: "ABC123",
        vehicleType: "CAR",
        entryTime,
      });

      assert.equal(created.entryTime, entryTime.toISOString());
    });

    it("rejects a plate that is already inside", async () => {
      const { parkingService } = buildService({ records: [activeRecord()] });

      await expectFailure(() => parkingService.registerEntry({ plate: "ABC123", vehicleType: "CAR" }), {
        statusCode: HTTP_STATUS.CONFLICT,
        message: ERROR_MESSAGES.PLATE_ALREADY_PARKED,
      });
    });

    it("accepts the same plate once the previous visit is closed", async () => {
      const { parkingService } = buildService({ records: [activeRecord({ status: "CLOSED" })] });

      const created = await parkingService.registerEntry({ plate: "ABC123", vehicleType: "CAR" });

      assert.equal(created.status, "ACTIVE");
    });

    it("translates a unique index violation that escapes the repository into a conflict", async () => {
      // The database guarantees the rule through the idx_active_plate partial unique index.
      // Even if the check above were bypassed, the caller sees a clear message rather than a
      // raw driver error.
      const uniqueViolation = Object.assign(new Error("duplicate key value"), {
        code: "23505",
        constraint: "idx_active_plate",
      });
      const { parkingService } = buildService({ createFailsWith: uniqueViolation });

      await expectFailure(() => parkingService.registerEntry({ plate: "ABC123", vehicleType: "CAR" }), {
        statusCode: HTTP_STATUS.CONFLICT,
        message: ERROR_MESSAGES.PLATE_ALREADY_PARKED,
      });
    });

    it("lets an unrelated driver error propagate untouched", async () => {
      const foreignKeyViolation = Object.assign(new Error("foreign key violation"), { code: "23503" });
      const { parkingService } = buildService({ createFailsWith: foreignKeyViolation });

      await assert.rejects(
        () => parkingService.registerEntry({ plate: "ABC123", vehicleType: "CAR" }),
        (error) => {
          assert.equal(error.code, "23503");
          assert.ok(!(error instanceof AppError), "it must not be swallowed as an operational error");
          return true;
        },
      );
    });
  });

  describe("rule 2: no entry once the lot is full", () => {
    it("rejects an entry when the occupancy has reached the capacity", async () => {
      const { parkingService } = buildService(
        { records: [activeRecord({ plate: "XYZ789" })] },
        { capacity: 1 },
      );

      await expectFailure(() => parkingService.registerEntry({ plate: "ABC123", vehicleType: "CAR" }), {
        statusCode: HTTP_STATUS.CONFLICT,
        message: ERROR_MESSAGES.PARKING_LOT_FULL,
      });
    });

    it("reports the duplicate plate first when the lot is also full", async () => {
      const { parkingService } = buildService({ records: [activeRecord()] }, { capacity: 1 });

      await expectFailure(() => parkingService.registerEntry({ plate: "ABC123", vehicleType: "CAR" }), {
        statusCode: HTTP_STATUS.CONFLICT,
        message: ERROR_MESSAGES.PLATE_ALREADY_PARKED,
      });
    });

    it("takes the advisory lock before reading the occupancy", async () => {
      // Reading the occupancy first would let two simultaneous requests see the same free
      // slot and both be admitted.
      const { parkingService, parkingRepository } = buildService();

      await parkingService.registerEntry({ plate: "ABC123", vehicleType: "CAR" });

      assert.deepEqual(parkingRepository.calls, [
        "lockParkingLot",
        "findActiveRecordByPlate",
        "countActiveRecords",
        "createParkingRecord",
      ]);
    });
  });

  describe("rules 3 and 4: the exit", () => {
    it("rejects an exit for a plate that is not inside", async () => {
      const { parkingService } = buildService();

      await expectFailure(() => parkingService.registerExit({ plate: "ZZZ999" }), {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.VEHICLE_NOT_FOUND,
      });
    });

    it("rejects an exit time earlier than the entry time", async () => {
      const entryTime = new Date();
      const { parkingService } = buildService({
        records: [activeRecord({ entryTime: entryTime.toISOString() })],
      });

      await expectFailure(
        () =>
          parkingService.registerExit({
            plate: "ABC123",
            exitTime: new Date(entryTime.getTime() - MINUTE_MS),
          }),
        {
          statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
          message: ERROR_MESSAGES.EXIT_BEFORE_ENTRY,
        },
      );
    });

    it("closes the ticket and returns the full receipt", async () => {
      const { parkingService } = buildService({
        records: [activeRecord({ entryTime: new Date(Date.now() - 90 * MINUTE_MS).toISOString() })],
      });

      const receipt = await parkingService.registerExit({ plate: "ABC123" });

      assert.equal(receipt.status, "CLOSED");
      assert.equal(receipt.stayMinutes, 90);
      assert.equal(receipt.totalAmount, 10000);
      assert.equal(receipt.vehicleTypeDescription, "Automóvil");
      assert.deepEqual(receipt.billing.stayDuration, { hours: 1, minutes: 30 });
      assert.equal(receipt.billing.billableHours, 2);
      assert.equal(receipt.billing.hourlyRate, 5000);
      assert.equal(receipt.billing.isWithinGracePeriod, false);
    });

    it("charges nothing for a stay inside the grace period", async () => {
      const { parkingService } = buildService({
        records: [activeRecord({ entryTime: new Date(Date.now() - 5 * MINUTE_MS).toISOString() })],
      });

      const receipt = await parkingService.registerExit({ plate: "ABC123" });

      assert.equal(receipt.totalAmount, 0);
      assert.equal(receipt.billing.isWithinGracePeriod, true);
    });

    it("applies the rate of the vehicle type of that ticket", async () => {
      const { parkingService } = buildService({
        records: [
          activeRecord({
            plate: "ABC12D",
            vehicleType: "MOTORCYCLE",
            entryTime: new Date(Date.now() - 90 * MINUTE_MS).toISOString(),
          }),
        ],
      });

      const receipt = await parkingService.registerExit({ plate: "ABC12D" });

      assert.equal(receipt.totalAmount, 5000);
    });

    it("answers not found when another request closed the same ticket first", async () => {
      // The real update carries "AND status = 'ACTIVE'", so the losing request matches no
      // row and nobody is charged twice.
      const { parkingService, parkingRepository } = buildService({ records: [activeRecord()] });
      parkingRepository.closeParkingRecord = async () => null;

      await expectFailure(() => parkingService.registerExit({ plate: "ABC123" }), {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.VEHICLE_NOT_FOUND,
      });
    });

    it("stops the exit when the rate of the vehicle type cannot be found", async () => {
      const { parkingService } = buildService({ records: [activeRecord()], vehicleTypes: [] });

      await expectFailure(() => parkingService.registerExit({ plate: "ABC123" }), {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.VEHICLE_TYPE_NOT_FOUND,
      });
    });
  });

  describe("queries", () => {
    it("reports availability consistent with the occupancy", async () => {
      const { parkingService } = buildService(
        { records: [activeRecord(), activeRecord({ id: 2, plate: "XYZ789", status: "CLOSED" })] },
        { capacity: 3 },
      );

      assert.deepEqual(await parkingService.getAvailability(), {
        capacity: 3,
        occupied: 1,
        available: 2,
        isFull: false,
      });
    });

    it("reports a full lot", async () => {
      const { parkingService } = buildService({ records: [activeRecord()] }, { capacity: 1 });

      const availability = await parkingService.getAvailability();

      assert.equal(availability.isFull, true);
      assert.equal(availability.available, 0);
    });

    it("never reports a negative number of free slots", async () => {
      // Lowering the configured capacity below the current occupancy is a legitimate
      // operational change and must not surface as a negative number in the interface.
      const { parkingService } = buildService(
        { records: [activeRecord(), activeRecord({ id: 2, plate: "XYZ789" })] },
        { capacity: 1 },
      );

      assert.equal((await parkingService.getAvailability()).available, 0);
    });

    it("lists only the open tickets among the parked vehicles", async () => {
      const { parkingService } = buildService({
        records: [activeRecord(), activeRecord({ id: 2, plate: "XYZ789", status: "CLOSED" })],
      });

      const parked = await parkingService.getParkedVehicles();

      assert.equal(parked.length, 1);
      assert.equal(parked[0].plate, "ABC123");
    });

    it("returns both open and closed visits in the history", async () => {
      const { parkingService } = buildService({
        records: [activeRecord(), activeRecord({ id: 2, plate: "XYZ789", status: "CLOSED" })],
      });

      assert.equal((await parkingService.getHistory()).length, 2);
    });

    it("returns the vehicle type catalog", async () => {
      const { parkingService } = buildService();

      assert.deepEqual(
        (await parkingService.getVehicleTypes()).map((type) => type.code),
        ["CAR", "MOTORCYCLE", "TRUCK"],
      );
    });

    it("finds a parked vehicle by plate", async () => {
      const { parkingService } = buildService({ records: [activeRecord()] });

      assert.equal((await parkingService.getVehicleByPlate("ABC123")).plate, "ABC123");
    });

    it("answers not found for a plate that is not inside", async () => {
      const { parkingService } = buildService({ records: [activeRecord()] });

      await expectFailure(() => parkingService.getVehicleByPlate("ZZZ999"), {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.VEHICLE_NOT_FOUND,
      });
    });
  });
});

describe("domain model mappers", () => {
  const entryTime = new Date("2026-08-22T08:00:00.000Z");
  const exitTime = new Date("2026-08-22T09:30:00.000Z");

  /** A row exactly as the pg driver delivers it: snake_case, NUMERIC as text, dates as Date. */
  const closedRow = {
    id: 7,
    plate: "ABC123",
    vehicle_type: "CAR",
    entry_time: entryTime,
    exit_time: exitTime,
    stay_minutes: 90,
    total_amount: "10000.00",
    status: "CLOSED",
    created_at: entryTime,
  };

  it("renames every column from snake_case to camelCase", () => {
    const record = toParkingRecord(closedRow);

    assert.deepEqual(Object.keys(record).sort(), [
      "createdAt",
      "entryTime",
      "exitTime",
      "id",
      "plate",
      "status",
      "stayMinutes",
      "totalAmount",
      "vehicleType",
    ]);
    assert.ok(!("vehicle_type" in record), "no snake_case key may leak past the mapper");
  });

  it("converts a NUMERIC column from text to a number", () => {
    // The driver returns NUMERIC as a string so it never silently loses precision. This is
    // the single place in the application where that conversion happens.
    const record = toParkingRecord(closedRow);

    assert.equal(typeof record.totalAmount, "number");
    assert.equal(record.totalAmount, 10000);
  });

  it("serializes timestamps as ISO strings", () => {
    const record = toParkingRecord(closedRow);

    assert.equal(record.entryTime, "2026-08-22T08:00:00.000Z");
    assert.equal(record.exitTime, "2026-08-22T09:30:00.000Z");
  });

  it("keeps the exit fields null while the ticket is open", () => {
    const record = toParkingRecord({
      ...closedRow,
      exit_time: null,
      stay_minutes: null,
      total_amount: null,
      status: PARKING_STATUS.ACTIVE,
    });

    assert.equal(record.exitTime, null);
    assert.equal(record.stayMinutes, null);
    assert.equal(record.totalAmount, null);
    assert.equal(record.status, PARKING_STATUS.ACTIVE);
  });

  it("returns null for a missing row, so the repository can express not found", () => {
    assert.equal(toParkingRecord(undefined), null);
    assert.equal(toParkingRecord(null), null);
    assert.equal(toVehicleType(undefined), null);
  });

  it("maps a list of rows", () => {
    assert.deepEqual(toParkingRecordList([]), []);
    assert.equal(toParkingRecordList([closedRow, closedRow]).length, 2);
  });

  it("converts the hourly rate of a vehicle type to a number", () => {
    const vehicleType = toVehicleType({
      code: "CAR",
      description: "Automóvil",
      hourly_rate: "5000.00",
    });

    assert.equal(typeof vehicleType.hourlyRate, "number");
    assert.equal(vehicleType.hourlyRate, 5000);
    assert.equal(vehicleType.description, "Automóvil");
  });

  it("maps a list of vehicle types", () => {
    const catalog = toVehicleTypeList([
      { code: "CAR", description: "Automóvil", hourly_rate: "5000.00" },
      { code: "TRUCK", description: "Camión", hourly_rate: "8000.00" },
    ]);

    assert.deepEqual(catalog.map((type) => type.code), ["CAR", "TRUCK"]);
  });

  it("exposes the domain enums as frozen values", () => {
    assert.deepEqual(VEHICLE_TYPE_CODES, ["CAR", "MOTORCYCLE", "TRUCK"]);
    assert.deepEqual(PARKING_STATUS, { ACTIVE: "ACTIVE", CLOSED: "CLOSED" });
    assert.ok(Object.isFrozen(VEHICLE_TYPE_CODES));
    assert.ok(Object.isFrozen(PARKING_STATUS));
  });
});
