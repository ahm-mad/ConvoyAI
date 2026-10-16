-- D-0172 (fleet enterprise readiness, ask B6, owner Q12 "(a)"): "who created / last changed this record" on the fleet records.
--
-- * `created_by` + `updated_by` on: vehicles, drivers, yards, yard_slots, geofences, vehicle_maintenance_schedules, compliance_documents.
-- * `updated_by` only on: trips (already has `created_by`), vehicle_maintenance_logs, fuel_logs, driver_incidents (their creator is the existing `logged_by`).
-- * Nullable BIGINT, foreign key to users(id) ON DELETE SET NULL. Existing rows stay NULL ("unknown" — nobody knows who created them, and we do not invent it).
-- * The application fills them centrally (platform/db/audit-actors.ts, from the request context); a write by the system (sensor / worker / scheduler)
--   leaves `updated_by` NULL, which the API reports as "System".
--
-- Also declared in `schema.prisma` as plain scalar fields (no Prisma relation), so a database created by `prisma db push` already has the columns;
-- every statement is guarded to be a no-op there and safe to re-run (D-0094).
DO $$
DECLARE
  spec RECORD;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('vehicles', 'created_by'), ('vehicles', 'updated_by'),
      ('drivers', 'created_by'), ('drivers', 'updated_by'),
      ('yards', 'created_by'), ('yards', 'updated_by'),
      ('yard_slots', 'created_by'), ('yard_slots', 'updated_by'),
      ('geofences', 'created_by'), ('geofences', 'updated_by'),
      ('vehicle_maintenance_schedules', 'created_by'), ('vehicle_maintenance_schedules', 'updated_by'),
      ('compliance_documents', 'created_by'), ('compliance_documents', 'updated_by'),
      ('trips', 'updated_by'),
      ('vehicle_maintenance_logs', 'updated_by'),
      ('fuel_logs', 'updated_by'),
      ('driver_incidents', 'updated_by')
    ) AS t(tbl, col)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = spec.tbl AND column_name = spec.col
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN %I BIGINT NULL', spec.tbl, spec.col);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = spec.tbl || '_' || spec.col || '_foreign'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION',
        spec.tbl, spec.tbl || '_' || spec.col || '_foreign', spec.col
      );
    END IF;
  END LOOP;
END $$;
