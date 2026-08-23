-- Parking Management System - database schema.
-- The script is idempotent: it can be executed as many times as needed.

CREATE TABLE IF NOT EXISTS vehicle_types (
  code          VARCHAR(20) PRIMARY KEY,
  description   VARCHAR(60) NOT NULL,
  hourly_rate   NUMERIC(10,2) NOT NULL CHECK (hourly_rate > 0)
);

CREATE TABLE IF NOT EXISTS parking_records (
  id             SERIAL PRIMARY KEY,
  plate          VARCHAR(10) NOT NULL,
  vehicle_type   VARCHAR(20) NOT NULL REFERENCES vehicle_types(code),
  entry_time     TIMESTAMPTZ NOT NULL,
  exit_time      TIMESTAMPTZ,
  stay_minutes   INTEGER,
  total_amount   NUMERIC(10,2),
  status         VARCHAR(10) NOT NULL DEFAULT 'ACTIVE'
                 CHECK (status IN ('ACTIVE','CLOSED')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_exit_time CHECK (exit_time IS NULL OR exit_time >= entry_time)
);

-- Partial unique index: guarantees at database level that a plate cannot be repeated
-- while the vehicle is inside, but still allows the history of previous visits.
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_plate
  ON parking_records (plate) WHERE status = 'ACTIVE';

-- Supports the parked vehicles listing and the occupancy count used by the capacity rule.
CREATE INDEX IF NOT EXISTS idx_parking_records_active_entry_time
  ON parking_records (entry_time DESC) WHERE status = 'ACTIVE';

-- Supports the single plate lookup and the visit history of a given plate.
CREATE INDEX IF NOT EXISTS idx_parking_records_plate_entry_time
  ON parking_records (plate, entry_time DESC);
