-- Module 2.4 (ingestion), D-0020/D-0054. Converts `device_values` into a
-- TimescaleDB hypertable, partitioned on `created_at`. Additive only — the
-- frozen `schema.sql`/`schema.prisma` are unchanged (ARCHITECTURE.md §9);
-- this runs directly against the live database, outside Prisma's migration
-- flow, since Prisma doesn't model Timescale objects.
--
-- `create_hypertable` requires every unique/primary-key index on the table
-- to include the partitioning column (`created_at`) — `device_values`' frozen
-- schema has a plain single-column primary key on `id` alone, which Timescale
-- rejects outright ("cannot create a unique index without the column ...
-- used in partitioning", confirmed by testing against this exact table).
-- The fix is a composite primary key `(id, created_at)`: `id` stays globally
-- unique (autoincrement), so every existing `WHERE id = ...` lookup keeps
-- working exactly as before — this only *adds* a broader constraint, it
-- doesn't change what "the same row" means. `schema.prisma` still declares
-- a plain `@id` on `id` alone; that stays accurate for every application
-- query since `id` alone remains unique in practice.
--
-- Idempotent: safe to re-run (checks the current primary key shape before
-- touching it; every Timescale call below already accepts `if_not_exists`).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.table_name = 'device_values'
      AND tc.constraint_type = 'PRIMARY KEY'
      AND kcu.column_name = 'created_at'
  ) THEN
    ALTER TABLE device_values DROP CONSTRAINT device_values_pkey;
    ALTER TABLE device_values ADD PRIMARY KEY (id, created_at);
  END IF;
END $$;

SELECT create_hypertable('device_values', 'created_at', migrate_data => TRUE, if_not_exists => TRUE);

-- Segmented by device_id (queries are almost always "this device's recent
-- values"), ordered by created_at DESC within each segment to match the
-- "latest value per device" read pattern module 2.3's points() uses.
ALTER TABLE device_values SET (
  timescaledb.compress,
  timescaledb.compress_orderby = 'created_at DESC',
  timescaledb.compress_segmentby = 'device_id'
);

-- D-0054 (user-approved): compress chunks older than 7 days, drop chunks
-- older than 12 months. Both are policy parameters, not schema — safe to
-- retune later without another migration file.
SELECT add_compression_policy('device_values', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_retention_policy('device_values', INTERVAL '12 months', if_not_exists => TRUE);
