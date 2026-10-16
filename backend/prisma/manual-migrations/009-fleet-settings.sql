-- D-0183 (fleet analytics, flow 07 ask F1, owner "approve A1-A7"): company fleet settings — the one place the analytics definitions read
-- their thresholds from (timezone, position freshness, idle threshold, scheduled hours, on-time grace, maintenance "due soon" window,
-- KPI targets). One row per company, created lazily by PUT /fleet/settings; a company without a row uses the defaults below.
--
-- Also declared in `schema.prisma` (scalar fields, no Prisma relation), so a database created by `prisma db push` already has the table;
-- every statement is guarded (IF NOT EXISTS) and safe to re-run (D-0094).
CREATE TABLE IF NOT EXISTS "fleet_settings" (
  "id"                                   BIGSERIAL PRIMARY KEY,
  "company_id"                           BIGINT NOT NULL,
  "timezone"                             VARCHAR(64) NOT NULL DEFAULT 'UTC',
  "position_freshness_minutes"           INTEGER NOT NULL DEFAULT 15,
  "idle_threshold_minutes"               INTEGER NOT NULL DEFAULT 5,
  "scheduled_hours_per_vehicle_per_day"  DECIMAL(4,1) NOT NULL DEFAULT 24,
  "on_time_grace_minutes"                INTEGER NOT NULL DEFAULT 0,
  "maintenance_due_soon_days"            INTEGER NOT NULL DEFAULT 7,
  "maintenance_due_soon_km"              INTEGER NOT NULL DEFAULT 500,
  "utilisation_target_pct"               DECIMAL(5,2) NULL,
  "on_time_target_pct"                   DECIMAL(5,2) NULL,
  "cost_per_km_target"                   DECIMAL(10,2) NULL,
  "idle_limit_pct"                       DECIMAL(5,2) NULL,
  "fuel_economy_target"                  DECIMAL(6,2) NULL,
  "updated_by"                           BIGINT NULL,
  "created_at"                           TIMESTAMP(0) NULL,
  "updated_at"                           TIMESTAMP(0) NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "fleet_settings_company_id_unique" ON "fleet_settings" ("company_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_settings_company_id_foreign') THEN
    ALTER TABLE "fleet_settings"
      ADD CONSTRAINT "fleet_settings_company_id_foreign" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_settings_updated_by_foreign') THEN
    ALTER TABLE "fleet_settings"
      ADD CONSTRAINT "fleet_settings_updated_by_foreign" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;
