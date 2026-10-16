-- D-0162 (fleet completion step 7, owner decisions D3 + D7): yards can be deactivated (not deleted — history references them), and every
-- yard that has coordinates gets a LINKED geofence so it can drive trip stops (sensor -> trip bridge, D-0156) without an operator creating one by hand.
--
-- * `yards.is_active` — deactivated yards leave assign/dropdown lists (lists take `?include_inactive=1`).
-- * ONE-TIME backfill (owner: "existing yards with coordinates and no linked geofence are backfilled with 100 m"): a 100 m geofence linked to every yard that
--   has coordinates and no geofence yet. It sits inside the "column does not exist yet" branch on purpose: re-running it on every bootstrap would resurrect a
--   geofence an operator deliberately deleted. The frontend's own yard geofences (yard 1, yard 2) are left alone by the NOT EXISTS check.
--
-- Also declared in `schema.prisma` (a database created by `prisma db push` already has the column), so it is guarded to be a no-op there (D-0094).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'yards' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE "yards" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

    INSERT INTO "geofences" ("company_id", "yard_id", "name", "center_latitude", "center_longitude", "radius_m", "alert_on", "is_active", "created_at", "updated_at")
    SELECT y."company_id", y."id", y."name", y."latitude", y."longitude", 100, 'both', true, now(), now()
    FROM "yards" y
    WHERE y."latitude" IS NOT NULL AND y."longitude" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "geofences" g WHERE g."yard_id" = y."id");
  END IF;
END $$;
