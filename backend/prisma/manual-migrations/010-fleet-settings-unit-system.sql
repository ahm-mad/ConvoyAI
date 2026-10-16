-- D-0192 (fleet analytics, frontend ask U1, owner "yes exactly as the frontend specified"): a per-company unit system on the company fleet settings —
-- `metric` (km, L, km/L; the default = today's behaviour for every existing company), `us` (mi, US gal, MPG) or `uk` (mi, litres, imperial MPG).
-- ONLY a preference the frontend reads to convert for display and for typed input: the API keeps storing and returning metric everywhere.
--
-- Additive and idempotent (D-0094): every statement is guarded, safe to re-run; existing rows take the `metric` default. Also declared in
-- `schema.prisma` (`fleet_settings.unit_system`), so a database created by `prisma db push` already has the column.
ALTER TABLE "fleet_settings" ADD COLUMN IF NOT EXISTS "unit_system" VARCHAR(8) NOT NULL DEFAULT 'metric';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_settings_unit_system_check') THEN
    ALTER TABLE "fleet_settings"
      ADD CONSTRAINT "fleet_settings_unit_system_check" CHECK ("unit_system" IN ('metric', 'us', 'uk'));
  END IF;
END $$;
