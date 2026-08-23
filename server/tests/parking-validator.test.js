import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "../src/constants/messages.js";
import { ValidationError } from "../src/errors/app-error.js";
import { HTTP_STATUS, buildErrorResponse, buildSuccessResponse } from "../src/utils/api-response.js";
import {
  validateHistoryQuery,
  validatePlateParam,
  validateVehicleEntry,
  validateVehicleExit,
} from "../src/validators/parking-validator.js";

/**
 * Expected messages are imported from the constants file rather than written out, so the
 * tests assert behaviour instead of duplicating Spanish text, and the rule that no Spanish
 * literal lives outside constants/messages.js keeps holding here too.
 */

const MINUTE_MS = 60_000;

const minutesAgo = (minutes) => new Date(Date.now() - minutes * MINUTE_MS).toISOString();
const minutesFromNow = (minutes) => new Date(Date.now() + minutes * MINUTE_MS).toISOString();

/** Runs a validator that is expected to fail and returns the accumulated messages. */
const collectErrors = (run) => {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof ValidationError, `expected a ValidationError, got ${error?.name}`);
    return error.errors;
  }

  throw new assert.AssertionError({ message: "expected the validator to reject the payload" });
};

describe("parking validator", () => {
  describe("category 1: required fields", () => {
    const emptyBodies = [
      { label: "an empty object", body: {} },
      { label: "undefined", body: undefined },
      { label: "null", body: null },
      { label: "an array", body: [] },
      { label: "a string", body: "plate=ABC123" },
    ];

    for (const { label, body } of emptyBodies) {
      it(`rejects ${label} as a body`, () => {
        assert.deepEqual(collectErrors(() => validateVehicleEntry(body)), [
          ERROR_MESSAGES.BODY_REQUIRED,
        ]);
      });
    }

    const missingPlates = [
      { label: "missing", plate: undefined },
      { label: "null", plate: null },
      { label: "an empty string", plate: "" },
      { label: "only whitespace", plate: "   " },
    ];

    for (const { label, plate } of missingPlates) {
      it(`reports the plate as required when it is ${label}`, () => {
        const errors = collectErrors(() => validateVehicleEntry({ plate, vehicleType: "CAR" }));

        assert.ok(errors.includes(ERROR_MESSAGES.PLATE_REQUIRED));
      });
    }

    it("reports the vehicle type as required when it is missing", () => {
      const errors = collectErrors(() => validateVehicleEntry({ plate: "ABC123" }));

      assert.ok(errors.includes(ERROR_MESSAGES.VEHICLE_TYPE_REQUIRED));
    });

    it("rejects an exit payload with no plate", () => {
      assert.deepEqual(collectErrors(() => validateVehicleExit({ exitTime: null })), [
        ERROR_MESSAGES.PLATE_REQUIRED,
      ]);
    });
  });

  describe("category 2: numeric values", () => {
    const invalidNumbers = [
      { label: "an unparseable string", value: "abc" },
      { label: "a negative number", value: "-1" },
      { label: "zero", value: "0" },
      { label: "a decimal", value: "1.5" },
      { label: "Infinity", value: "Infinity" },
      { label: "NaN", value: "NaN" },
      { label: "a boolean", value: true },
      { label: "an array", value: ["1", "2"] },
      { label: "an object", value: { value: 1 } },
    ];

    for (const { label, value } of invalidNumbers) {
      it(`rejects a limit given as ${label}`, () => {
        assert.deepEqual(collectErrors(() => validateHistoryQuery({ limit: value })), [
          ERROR_MESSAGES.LIMIT_INVALID,
        ]);
      });
    }

    it("rejects a negative offset", () => {
      assert.deepEqual(collectErrors(() => validateHistoryQuery({ offset: "-1" })), [
        ERROR_MESSAGES.OFFSET_INVALID,
      ]);
    });

    it("converts query string numbers into real numbers", () => {
      assert.deepEqual(validateHistoryQuery({ limit: "25", offset: "0" }), { limit: 25, offset: 0 });
    });

    it("accepts a request with no pagination at all", () => {
      assert.deepEqual(validateHistoryQuery({}), { limit: null, offset: null });
      assert.deepEqual(validateHistoryQuery(), { limit: null, offset: null });
    });

    it("accumulates one error per invalid pagination field", () => {
      const errors = collectErrors(() => validateHistoryQuery({ limit: "abc", offset: "x" }));

      assert.deepEqual(errors, [ERROR_MESSAGES.LIMIT_INVALID, ERROR_MESSAGES.OFFSET_INVALID]);
    });
  });

  describe("category 3: non numeric values and plate format", () => {
    it("normalizes the plate with trim and uppercase", () => {
      assert.equal(validateVehicleEntry({ plate: "  abc123 ", vehicleType: "CAR" }).plate, "ABC123");
    });

    it("normalizes the vehicle type with trim and uppercase", () => {
      assert.equal(validateVehicleEntry({ plate: "ABC123", vehicleType: " car " }).vehicleType, "CAR");
    });

    it("rejects a plate that is not text", () => {
      assert.deepEqual(collectErrors(() => validateVehicleEntry({ plate: 123456, vehicleType: "CAR" })), [
        ERROR_MESSAGES.PLATE_INVALID_FORMAT,
      ]);
    });

    const malformedPlates = [
      { label: "a separator", plate: "ABC-123" },
      { label: "too few characters", plate: "AB123" },
      { label: "too many characters", plate: "ABC1234" },
      { label: "only letters", plate: "ABCDEF" },
      { label: "digits first", plate: "123ABC" },
    ];

    for (const { label, plate } of malformedPlates) {
      it(`rejects a car plate with ${label}`, () => {
        assert.deepEqual(collectErrors(() => validateVehicleEntry({ plate, vehicleType: "CAR" })), [
          ERROR_MESSAGES.PLATE_INVALID_FORMAT,
        ]);
      });
    }

    it("accepts the motorcycle pattern for a MOTORCYCLE", () => {
      assert.equal(
        validateVehicleEntry({ plate: "ABC12D", vehicleType: "MOTORCYCLE" }).plate,
        "ABC12D",
      );
    });

    it("rejects the motorcycle pattern for a CAR", () => {
      assert.deepEqual(
        collectErrors(() => validateVehicleEntry({ plate: "ABC12D", vehicleType: "CAR" })),
        [ERROR_MESSAGES.PLATE_INVALID_FORMAT],
      );
    });

    it("rejects the car pattern for a MOTORCYCLE", () => {
      assert.deepEqual(
        collectErrors(() => validateVehicleEntry({ plate: "ABC123", vehicleType: "MOTORCYCLE" })),
        [ERROR_MESSAGES.PLATE_INVALID_FORMAT],
      );
    });

    it("applies the car pattern to a TRUCK", () => {
      assert.equal(validateVehicleEntry({ plate: "XYZ789", vehicleType: "TRUCK" }).plate, "XYZ789");
    });

    it("does not invent a plate error when the vehicle type is the invalid field", () => {
      // With an unknown type there is no way to know which pattern applies, so the plate is
      // matched against both. Assuming one would report a plate error that does not exist.
      assert.deepEqual(
        collectErrors(() => validateVehicleEntry({ plate: "ABC12D", vehicleType: "BICYCLE" })),
        [ERROR_MESSAGES.VEHICLE_TYPE_INVALID],
      );
    });

    it("accepts either pattern on an exit payload, which carries no vehicle type", () => {
      assert.equal(validateVehicleExit({ plate: "abc123" }).plate, "ABC123");
      assert.equal(validateVehicleExit({ plate: "abc12d" }).plate, "ABC12D");
    });
  });

  describe("category 4: allowed ranges", () => {
    const invalidVehicleTypes = [
      { label: "an unknown code", vehicleType: "BICYCLE" },
      { label: "a number", vehicleType: 5 },
      { label: "an object", vehicleType: { code: "CAR" } },
    ];

    for (const { label, vehicleType } of invalidVehicleTypes) {
      it(`rejects a vehicle type given as ${label}`, () => {
        const errors = collectErrors(() => validateVehicleEntry({ plate: "ABC123", vehicleType }));

        assert.ok(errors.includes(ERROR_MESSAGES.VEHICLE_TYPE_INVALID));
      });
    }

    it("requires a timezone designator on a date", () => {
      assert.deepEqual(
        collectErrors(() =>
          validateVehicleEntry({
            plate: "ABC123",
            vehicleType: "CAR",
            entryTime: "2026-08-22T10:00:00",
          }),
        ),
        [ERROR_MESSAGES.DATE_TIMEZONE_REQUIRED],
      );
    });

    const invalidDates = [
      { label: "free text", entryTime: "ayer" },
      { label: "a date with no time", entryTime: "2026-08-22" },
      { label: "a numeric timestamp", entryTime: 1_755_855_600_000 },
      { label: "the 31st of February", entryTime: "2026-02-31T10:00:00Z" },
      { label: "the 29th of February on a non leap year", entryTime: "2025-02-29T10:00:00Z" },
      { label: "month 13", entryTime: "2026-13-01T10:00:00Z" },
      { label: "day 32", entryTime: "2026-08-32T10:00:00Z" },
      { label: "hour 24", entryTime: "2026-08-22T24:00:00Z" },
      { label: "hour 25", entryTime: "2026-08-22T25:00:00Z" },
      { label: "minute 60", entryTime: "2026-08-22T10:60:00Z" },
      { label: "an impossible offset", entryTime: "2026-08-22T10:00:00+99:00" },
    ];

    for (const { label, entryTime } of invalidDates) {
      it(`rejects ${label}`, () => {
        assert.deepEqual(
          collectErrors(() => validateVehicleEntry({ plate: "ABC123", vehicleType: "CAR", entryTime })),
          [ERROR_MESSAGES.INVALID_DATE],
        );
      });
    }

    it("accepts the 29th of February on an actual leap year", () => {
      const result = validateVehicleEntry({
        plate: "ABC123",
        vehicleType: "CAR",
        entryTime: "2024-02-29T10:00:00Z",
      });

      assert.ok(result.entryTime instanceof Date);
    });

    it("rejects a date in the future", () => {
      assert.deepEqual(
        collectErrors(() =>
          validateVehicleEntry({
            plate: "ABC123",
            vehicleType: "CAR",
            entryTime: minutesFromNow(60),
          }),
        ),
        [ERROR_MESSAGES.FUTURE_DATE],
      );
    });

    it("tolerates a client clock running slightly ahead of the server", () => {
      const result = validateVehicleEntry({
        plate: "ABC123",
        vehicleType: "CAR",
        entryTime: new Date(Date.now() + 30_000).toISOString(),
      });

      assert.ok(result.entryTime instanceof Date);
    });

    it("returns a Date for a valid past instant", () => {
      const entryTime = minutesAgo(90);
      const result = validateVehicleEntry({ plate: "ABC123", vehicleType: "CAR", entryTime });

      assert.ok(result.entryTime instanceof Date);
      assert.equal(result.entryTime.toISOString(), entryTime);
    });

    it("accepts an explicit offset, not only Z", () => {
      const result = validateVehicleEntry({
        plate: "ABC123",
        vehicleType: "CAR",
        entryTime: "2024-02-29T05:30:00-05:00",
      });

      assert.ok(result.entryTime instanceof Date);
    });

    it("treats the timestamp as optional", () => {
      assert.equal(validateVehicleEntry({ plate: "ABC123", vehicleType: "CAR" }).entryTime, null);
      assert.equal(validateVehicleExit({ plate: "ABC123" }).exitTime, null);
    });
  });

  describe("error accumulation and contract", () => {
    it("returns every problem at once instead of stopping at the first", () => {
      const errors = collectErrors(() =>
        validateVehicleEntry({ plate: "", vehicleType: "BICYCLE", entryTime: "ayer" }),
      );

      assert.deepEqual(errors, [
        ERROR_MESSAGES.PLATE_REQUIRED,
        ERROR_MESSAGES.VEHICLE_TYPE_INVALID,
        ERROR_MESSAGES.INVALID_DATE,
      ]);
    });

    it("raises a ValidationError carrying 400 and the generic failure message", () => {
      try {
        validateVehicleEntry({ plate: "", vehicleType: "" });
        assert.fail("expected the validator to reject the payload");
      } catch (error) {
        assert.ok(error instanceof ValidationError);
        assert.equal(error.statusCode, HTTP_STATUS.BAD_REQUEST);
        assert.equal(error.isOperational, true);
        assert.equal(error.message, ERROR_MESSAGES.VALIDATION_FAILED);
        assert.ok(Array.isArray(error.errors));
      }
    });
  });

  describe("plate path parameter", () => {
    it("normalizes the plate", () => {
      assert.equal(validatePlateParam(" abc123 "), "ABC123");
    });

    it("rejects a malformed plate", () => {
      assert.deepEqual(collectErrors(() => validatePlateParam("XX")), [
        ERROR_MESSAGES.PLATE_INVALID_FORMAT,
      ]);
    });
  });

  describe("message catalog", () => {
    it("holds only non empty strings inside frozen objects", () => {
      const allMessages = { ...SUCCESS_MESSAGES, ...ERROR_MESSAGES };

      assert.ok(Object.isFrozen(SUCCESS_MESSAGES));
      assert.ok(Object.isFrozen(ERROR_MESSAGES));
      assert.ok(Object.keys(allMessages).length > 0);
      assert.ok(
        Object.values(allMessages).every((message) => typeof message === "string" && message.length > 0),
      );
    });
  });
});

describe("api response envelope", () => {
  it("builds the documented success shape", () => {
    assert.deepEqual(
      buildSuccessResponse({ message: SUCCESS_MESSAGES.ENTRY_REGISTERED, data: { id: 1 } }),
      { success: true, message: SUCCESS_MESSAGES.ENTRY_REGISTERED, data: { id: 1 } },
    );
  });

  it("defaults the data to null when there is nothing to return", () => {
    assert.deepEqual(buildSuccessResponse({ message: SUCCESS_MESSAGES.SERVICE_HEALTHY }), {
      success: true,
      message: SUCCESS_MESSAGES.SERVICE_HEALTHY,
      data: null,
    });
  });

  it("builds the documented error shape with its list of problems", () => {
    assert.deepEqual(
      buildErrorResponse({
        message: ERROR_MESSAGES.VALIDATION_FAILED,
        errors: [ERROR_MESSAGES.PLATE_REQUIRED],
      }),
      {
        success: false,
        message: ERROR_MESSAGES.VALIDATION_FAILED,
        errors: [ERROR_MESSAGES.PLATE_REQUIRED],
      },
    );
  });

  it("omits the errors array when there is nothing to list", () => {
    // A business rule failure must not ship an empty array that a client could mistake for
    // a validation problem.
    assert.deepEqual(buildErrorResponse({ message: ERROR_MESSAGES.PARKING_LOT_FULL }), {
      success: false,
      message: ERROR_MESSAGES.PARKING_LOT_FULL,
    });

    assert.ok(!("errors" in buildErrorResponse({ message: ERROR_MESSAGES.PARKING_LOT_FULL, errors: [] })));
  });

  it("exposes every status code the api answers", () => {
    assert.deepEqual(HTTP_STATUS, {
      OK: 200,
      CREATED: 201,
      BAD_REQUEST: 400,
      NOT_FOUND: 404,
      CONFLICT: 409,
      PAYLOAD_TOO_LARGE: 413,
      UNPROCESSABLE_ENTITY: 422,
      INTERNAL_SERVER_ERROR: 500,
      SERVICE_UNAVAILABLE: 503,
    });
  });
});
