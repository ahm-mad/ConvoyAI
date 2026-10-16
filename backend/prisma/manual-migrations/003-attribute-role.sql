-- D-0154 (fleet completion step 3, owner decision D1): an explicit GPS "role" on a product attribute
-- (latitude / longitude / speed / heading), replacing the fragile "the user-typed label must literally say
-- Latitude" detection Laravel used (`ProductController::recordDevicePositionIfPresent`).
--
-- Also declared in `schema.prisma` (a brand-new database created by `prisma db push` already has the column
-- and type), so every statement here is guarded to be a no-op in that case — same idempotency rule as the
-- other files in this folder (D-0094): the Phase 7 bootstrap runs all of them on every start.
--
-- The one-time BACKFILL (roles from today's labels) sits inside the "column does not exist yet" branch on
-- purpose: it must run exactly once, on the first migration of an existing database. Running it on every
-- bootstrap would resurrect a role an operator deliberately cleared, because ingestion is role-only now and
-- "clear role" is only meaningful if nothing re-derives it from a label afterwards.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attribute_role') THEN
    CREATE TYPE "attribute_role" AS ENUM ('latitude', 'longitude', 'speed', 'heading');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_attribute_preferences' AND column_name = 'attribute_role'
  ) THEN
    ALTER TABLE "product_attribute_preferences" ADD COLUMN "attribute_role" "attribute_role";

    -- Backfill: a role is assigned only when exactly ONE non-unique-identifier attribute of the product carries
    -- one of that role's accepted labels (trimmed, case-insensitive — the exact sets the old detection used).
    -- Ambiguous cases (two attributes both labelled "Latitude") are left unset for the operator to resolve.
    WITH candidates AS (
      SELECT p.id AS preference_id,
             p.product_id,
             CASE
               WHEN lower(btrim(s.label)) IN ('latitude', 'lat') THEN 'latitude'
               WHEN lower(btrim(s.label)) IN ('longitude', 'lng', 'lon') THEN 'longitude'
               WHEN lower(btrim(s.label)) = 'speed' THEN 'speed'
               WHEN lower(btrim(s.label)) IN ('heading', 'course', 'bearing') THEN 'heading'
             END::"attribute_role" AS role
      FROM "product_attribute_preferences" p
      JOIN "product_attribute_preference_settings" s ON s.product_attribute_preference_id = p.id
      WHERE p.attribute_key IS NOT NULL AND p.is_unique_identifier = false
    ),
    unambiguous AS (
      SELECT product_id, role, min(preference_id) AS preference_id
      FROM candidates
      WHERE role IS NOT NULL
      GROUP BY product_id, role
      HAVING count(*) = 1
    )
    UPDATE "product_attribute_preferences" p
    SET attribute_role = u.role
    FROM unambiguous u
    WHERE p.id = u.preference_id;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "product_attribute_preferences_product_role_unique"
  ON "product_attribute_preferences" ("product_id", "attribute_role")
  WHERE "attribute_role" IS NOT NULL;
