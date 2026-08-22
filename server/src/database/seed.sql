-- Parking Management System - catalog seed data.
-- The code travels in English inside the API payloads while the description holds the
-- Spanish text rendered by the client, so the front end does not need to map anything.

INSERT INTO vehicle_types (code, description, hourly_rate) VALUES
  ('CAR',        'Automóvil',   5000.00),
  ('MOTORCYCLE', 'Motocicleta', 2500.00),
  ('TRUCK',      'Camión',      8000.00)
ON CONFLICT (code) DO NOTHING;
