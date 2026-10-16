-- D-0156 (fleet completion step 5, owner decision D2): every geofence event records which trip the vehicle was on
-- when it happened, so the sensor->trip bridge (planned stop arrive/depart from geofence enter/exit) and the
-- events feed/socket can name the trip. `NULL` = no trip was in progress. Existing events stay NULL (nothing to backfill).
--
-- Also declared in `schema.prisma` (a database created by `prisma db push` already has the column), so every
-- statement is guarded to be a no-op in that case — same idempotency rule as the other files here (D-0094).
ALTER TABLE "geofence_events" ADD COLUMN IF NOT EXISTS "trip_id" BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'geofence_events_trip_id_foreign') THEN
    ALTER TABLE "geofence_events"
      ADD CONSTRAINT "geofence_events_trip_id_foreign"
      FOREIGN KEY ("trip_id") REFERENCES "trips" ("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "geofence_events_trip_id_index" ON "geofence_events" ("trip_id");
