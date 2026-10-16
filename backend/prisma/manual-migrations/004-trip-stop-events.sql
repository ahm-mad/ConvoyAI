-- D-0155 (fleet completion step 4, owner decisions D5/D4): manual stop arrive/depart with an immutable audit log,
-- and the "destination reached" marker the sensor bridge (step 5) will set.
--
--   * `trip_stop_events` — append-only log of every arrival/departure recorded against a planned stop (manual now,
--     geofence_auto from step 5). The stop row itself always holds the EFFECTIVE value; the log keeps every value
--     ever recorded, including the original sensor time an operator later overrides (owner D5: "the original sensor
--     time must stay visible/auditable").
--   * `trips.destination_reached_at` — set once when the trip's destination is reached (step 5); step 4 only reads it.
--
-- Also declared in `schema.prisma` (a database created by `prisma db push` already has all of this), so every
-- statement is guarded to be a no-op in that case — same idempotency rule as the other files here (D-0094). Nothing
-- to backfill.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trip_stop_events_event_type') THEN
    CREATE TYPE "trip_stop_events_event_type" AS ENUM ('arrive', 'depart');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "trip_stop_events" (
  "id"                   BIGSERIAL PRIMARY KEY,
  "trip_planned_yard_id" BIGINT NOT NULL,
  "trip_id"              BIGINT NOT NULL,
  "event_type"           "trip_stop_events_event_type" NOT NULL,
  "occurred_at"          TIMESTAMP(0) NOT NULL,
  "source"               "trip_planned_yards_actual_source" NOT NULL,
  "reason"               TEXT,
  "recorded_by"          BIGINT,
  "created_at"           TIMESTAMP(0),
  "updated_at"           TIMESTAMP(0),
  CONSTRAINT "trip_stop_events_trip_planned_yard_id_foreign"
    FOREIGN KEY ("trip_planned_yard_id") REFERENCES "trip_planned_yards" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "trip_stop_events_trip_id_foreign"
    FOREIGN KEY ("trip_id") REFERENCES "trips" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "trip_stop_events_trip_planned_yard_id_occurred_at_index"
  ON "trip_stop_events" ("trip_planned_yard_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "trip_stop_events_trip_id_index" ON "trip_stop_events" ("trip_id");

ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "destination_reached_at" TIMESTAMP(0);
