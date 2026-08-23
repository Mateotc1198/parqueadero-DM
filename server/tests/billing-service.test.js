import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateBilling } from "../src/services/billing-service.js";
import {
  MILLISECONDS_PER_MINUTE,
  calculateStayMinutes,
  formatStayDuration,
} from "../src/utils/time-utils.js";

/**
 * The billing service is a pure function, so these tests need no database, no environment
 * and no clock control: every instant is passed in as an argument.
 */

const ENTRY_TIME = new Date("2026-08-22T08:00:00.000Z");

const CAR_HOURLY_RATE = 5000;
const MOTORCYCLE_HOURLY_RATE = 2500;
const TRUCK_HOURLY_RATE = 8000;

const GRACE_MINUTES = 10;

const exitAfterMinutes = (minutes) =>
  new Date(ENTRY_TIME.getTime() + minutes * MILLISECONDS_PER_MINUTE);

const exitAfterMilliseconds = (milliseconds) => new Date(ENTRY_TIME.getTime() + milliseconds);

const billFor = ({ minutes, hourlyRate = CAR_HOURLY_RATE, graceMinutes = 0 }) =>
  calculateBilling({
    entryTime: ENTRY_TIME,
    exitTime: exitAfterMinutes(minutes),
    hourlyRate,
    graceMinutes,
  });

describe("billing service", () => {
  describe("hour fraction: any started hour is charged as a full hour", () => {
    const cases = [
      { minutes: 1, expectedHours: 1 },
      { minutes: 30, expectedHours: 1 },
      { minutes: 59, expectedHours: 1 },
      { minutes: 60, expectedHours: 1 },
      { minutes: 61, expectedHours: 2 },
      { minutes: 119, expectedHours: 2 },
      { minutes: 120, expectedHours: 2 },
      { minutes: 121, expectedHours: 3 },
    ];

    for (const { minutes, expectedHours } of cases) {
      it(`charges ${expectedHours} hour(s) for a stay of ${minutes} minutes`, () => {
        const billing = billFor({ minutes });

        assert.equal(billing.billableHours, expectedHours);
        assert.equal(billing.totalAmount, expectedHours * CAR_HOURLY_RATE);
      });
    }

    it("truncates the stay to whole minutes so a few seconds never cost an extra hour", () => {
      const billing = calculateBilling({
        entryTime: ENTRY_TIME,
        exitTime: exitAfterMilliseconds(60 * MILLISECONDS_PER_MINUTE + 30_000),
        hourlyRate: CAR_HOURLY_RATE,
        graceMinutes: 0,
      });

      assert.equal(billing.stayMinutes, 60);
      assert.equal(billing.billableHours, 1);
    });
  });

  describe("grace period", () => {
    it("charges nothing for a stay shorter than the grace period", () => {
      const billing = billFor({ minutes: 5, graceMinutes: GRACE_MINUTES });

      assert.equal(billing.isWithinGracePeriod, true);
      assert.equal(billing.billableHours, 0);
      assert.equal(billing.totalAmount, 0);
    });

    it("treats the grace boundary as inclusive, so the edge favours the customer", () => {
      const billing = billFor({ minutes: GRACE_MINUTES, graceMinutes: GRACE_MINUTES });

      assert.equal(billing.isWithinGracePeriod, true);
      assert.equal(billing.totalAmount, 0);
    });

    it("charges a full hour one minute past the grace period", () => {
      const billing = billFor({ minutes: GRACE_MINUTES + 1, graceMinutes: GRACE_MINUTES });

      assert.equal(billing.isWithinGracePeriod, false);
      assert.equal(billing.billableHours, 1);
      assert.equal(billing.totalAmount, CAR_HOURLY_RATE);
    });

    it("does not subtract the grace minutes from a longer stay", () => {
      // 70 minutes minus 10 of grace would be 60, a single hour. The rule is all or nothing,
      // so the whole stay is billed: two hours.
      const billing = billFor({ minutes: 70, graceMinutes: GRACE_MINUTES });

      assert.equal(billing.billableHours, 2);
      assert.equal(billing.totalAmount, 2 * CAR_HOURLY_RATE);
    });

    it("charges nothing for a zero length stay", () => {
      assert.equal(billFor({ minutes: 0, graceMinutes: GRACE_MINUTES }).totalAmount, 0);
      assert.equal(billFor({ minutes: 0, graceMinutes: 0 }).totalAmount, 0);
    });

    it("charges one hour for a single minute when there is no grace period", () => {
      assert.equal(billFor({ minutes: 1, graceMinutes: 0 }).totalAmount, CAR_HOURLY_RATE);
    });
  });

  describe("several hours", () => {
    it("bills four hours for a stay of three hours and ten minutes", () => {
      const billing = billFor({ minutes: 190, graceMinutes: GRACE_MINUTES });

      assert.equal(billing.stayMinutes, 190);
      assert.deepEqual(billing.stayDuration, { hours: 3, minutes: 10 });
      assert.equal(billing.billableHours, 4);
      assert.equal(billing.totalAmount, 4 * CAR_HOURLY_RATE);
    });

    it("bills a full day as twenty four hours", () => {
      const billing = billFor({ minutes: 24 * 60, graceMinutes: GRACE_MINUTES });

      assert.equal(billing.billableHours, 24);
      assert.equal(billing.totalAmount, 24 * CAR_HOURLY_RATE);
    });
  });

  describe("hourly rate per vehicle type", () => {
    const cases = [
      { vehicleType: "CAR", hourlyRate: CAR_HOURLY_RATE, expectedTotal: 10000 },
      { vehicleType: "MOTORCYCLE", hourlyRate: MOTORCYCLE_HOURLY_RATE, expectedTotal: 5000 },
      { vehicleType: "TRUCK", hourlyRate: TRUCK_HOURLY_RATE, expectedTotal: 16000 },
    ];

    for (const { vehicleType, hourlyRate, expectedTotal } of cases) {
      it(`charges ${expectedTotal} for a 90 minute stay of a ${vehicleType}`, () => {
        assert.equal(billFor({ minutes: 90, hourlyRate }).totalAmount, expectedTotal);
      });
    }

    it("keeps a decimal rate within two decimals, with no floating point drift", () => {
      assert.equal(billFor({ minutes: 90, hourlyRate: 2500.5 }).totalAmount, 5001);
      assert.equal(billFor({ minutes: 90, hourlyRate: 0.1 }).totalAmount, 0.2);
    });
  });

  describe("breakdown contract", () => {
    it("exposes every field the receipt and the database row need", () => {
      const billing = billFor({ minutes: 90, graceMinutes: GRACE_MINUTES });

      assert.deepEqual(billing, {
        stayMinutes: 90,
        stayDuration: { hours: 1, minutes: 30 },
        isWithinGracePeriod: false,
        billableHours: 2,
        hourlyRate: CAR_HOURLY_RATE,
        graceMinutes: GRACE_MINUTES,
        totalAmount: 10000,
      });
    });

    it("returns a frozen value at both levels", () => {
      const billing = billFor({ minutes: 90 });

      assert.ok(Object.isFrozen(billing));
      assert.ok(Object.isFrozen(billing.stayDuration));
    });

    it("produces the same result for the same input", () => {
      assert.deepEqual(
        billFor({ minutes: 77, graceMinutes: GRACE_MINUTES }),
        billFor({ minutes: 77, graceMinutes: GRACE_MINUTES }),
      );
    });
  });

  describe("argument guards", () => {
    // These are contract violations, meaning a programming mistake rather than a user
    // mistake, so they throw plain errors and never an AppError. The parking service
    // enforces the exit-after-entry rule and answers 422 before this function is reached.
    const invalidArguments = [
      {
        label: "an exitTime earlier than the entryTime",
        argument: {
          entryTime: exitAfterMinutes(10),
          exitTime: ENTRY_TIME,
          hourlyRate: CAR_HOURLY_RATE,
          graceMinutes: 0,
        },
        ExpectedError: RangeError,
      },
      {
        label: "an hourly rate of zero",
        argument: { entryTime: ENTRY_TIME, exitTime: exitAfterMinutes(10), hourlyRate: 0, graceMinutes: 0 },
        ExpectedError: RangeError,
      },
      {
        label: "a negative hourly rate",
        argument: { entryTime: ENTRY_TIME, exitTime: exitAfterMinutes(10), hourlyRate: -100, graceMinutes: 0 },
        ExpectedError: RangeError,
      },
      {
        label: "an hourly rate of NaN",
        argument: {
          entryTime: ENTRY_TIME,
          exitTime: exitAfterMinutes(10),
          hourlyRate: Number.NaN,
          graceMinutes: 0,
        },
        ExpectedError: RangeError,
      },
      {
        label: "an infinite hourly rate",
        argument: {
          entryTime: ENTRY_TIME,
          exitTime: exitAfterMinutes(10),
          hourlyRate: Number.POSITIVE_INFINITY,
          graceMinutes: 0,
        },
        ExpectedError: RangeError,
      },
      {
        label: "a negative grace period",
        argument: {
          entryTime: ENTRY_TIME,
          exitTime: exitAfterMinutes(10),
          hourlyRate: CAR_HOURLY_RATE,
          graceMinutes: -1,
        },
        ExpectedError: RangeError,
      },
      {
        label: "a fractional grace period",
        argument: {
          entryTime: ENTRY_TIME,
          exitTime: exitAfterMinutes(10),
          hourlyRate: CAR_HOURLY_RATE,
          graceMinutes: 1.5,
        },
        ExpectedError: RangeError,
      },
      {
        label: "an invalid entryTime",
        argument: {
          entryTime: "yesterday",
          exitTime: exitAfterMinutes(10),
          hourlyRate: CAR_HOURLY_RATE,
          graceMinutes: 0,
        },
        ExpectedError: TypeError,
      },
      {
        label: "an invalid exitTime",
        argument: {
          entryTime: ENTRY_TIME,
          exitTime: "soon",
          hourlyRate: CAR_HOURLY_RATE,
          graceMinutes: 0,
        },
        ExpectedError: TypeError,
      },
    ];

    for (const { label, argument, ExpectedError } of invalidArguments) {
      it(`rejects ${label} with a ${ExpectedError.name}`, () => {
        assert.throws(() => calculateBilling(argument), ExpectedError);
      });
    }
  });
});

describe("time utilities", () => {
  it("counts whole minutes between two instants", () => {
    assert.equal(calculateStayMinutes(ENTRY_TIME, exitAfterMinutes(90)), 90);
  });

  it("truncates rather than rounding", () => {
    assert.equal(calculateStayMinutes(ENTRY_TIME, exitAfterMilliseconds(90 * 60_000 + 59_000)), 90);
    assert.equal(calculateStayMinutes(ENTRY_TIME, exitAfterMilliseconds(59_000)), 0);
  });

  it("returns zero for a zero length interval", () => {
    assert.equal(calculateStayMinutes(ENTRY_TIME, ENTRY_TIME), 0);
  });

  it("accepts ISO strings as well as Date instances", () => {
    assert.equal(calculateStayMinutes("2026-08-22T08:00:00Z", "2026-08-22T09:30:00Z"), 90);
  });

  it("rejects an invalid date", () => {
    assert.throws(() => calculateStayMinutes("not a date", ENTRY_TIME), TypeError);
  });

  it("splits a duration into hours and remaining minutes", () => {
    assert.deepEqual(formatStayDuration(0), { hours: 0, minutes: 0 });
    assert.deepEqual(formatStayDuration(59), { hours: 0, minutes: 59 });
    assert.deepEqual(formatStayDuration(60), { hours: 1, minutes: 0 });
    assert.deepEqual(formatStayDuration(190), { hours: 3, minutes: 10 });
  });

  it("rejects a negative or fractional number of minutes", () => {
    assert.throws(() => formatStayDuration(-1), TypeError);
    assert.throws(() => formatStayDuration(1.5), TypeError);
  });
});
