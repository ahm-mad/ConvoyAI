-- D-0196 (fleet analytics, owner decision "option A - 12 months raw, compress after 7 days, rollups kept forever", 2026-09-25): converts
-- `device_positions` (the raw GPS packets) into a TimescaleDB hypertable partitioned on `recorded_at` (7-day chunks), compressed after 7 days
-- (segmented by device_id, newest first within a segment) and DELETED after 12 months. The hourly rollup `vehicle_hourly_stats` (D-0194) is the
-- long-lived history and has no retention policy, so trips' GPS trails older than 12 months are the only thing that disappears (KNOWN_ISSUES 11.104).
-- Retention drops whole 7-day chunks: nothing is deleted until a chunk lies entirely older than 12 months, and the policy job runs daily.
--
-- Same shape as `001-device-values-hypertable.sql`: `create_hypertable` needs every unique / primary-key index to include the partitioning column, and
-- `device_positions`' frozen primary key is `(id)` alone — it becomes `(id, recorded_at)`. `id` stays globally unique in practice (a sequence), so every
-- `WHERE id = ...` keeps working; `schema.prisma` still declares `@id` on `id` alone, which stays accurate for every application query. Foreign keys
-- FROM `device_positions` (device_id -> devices, ON DELETE CASCADE) are supported on hypertables; nothing references `device_positions`.
--
-- The application reads that must stay fast on compressed chunks (the latest position of each device) use a per-device LATERAL query — an id-only lookup
-- or a whole-history group-by decompresses every chunk (measured on 2.6 million rows: 2.6 s vs 1 ms; see D-0196).
--
-- Idempotent: safe to re-run (checks the current primary key shape first; every Timescale call accepts `if_not_exists`).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.table_name = 'device_positions'
      AND tc.constraint_type = 'PRIMARY KEY'
      AND kcu.column_name = 'recorded_at'
  ) THEN
    ALTER TABLE device_positions DROP CONSTRAINT device_positions_pkey;
    ALTER TABLE device_positions ADD PRIMARY KEY (id, recorded_at);
  END IF;
END $$;

SELECT create_hypertable('device_positions', 'recorded_at', chunk_time_interval => INTERVAL '7 days', migrate_data => TRUE, if_not_exists => TRUE);

ALTER TABLE device_positions SET (
  timescaledb.compress,
  timescaledb.compress_orderby = 'recorded_at DESC',
  timescaledb.compress_segmentby = 'device_id'
);

-- Owner-approved (D-0196): compress chunks older than 7 days, drop chunks older than 12 months. Policy parameters, not schema — retunable later
-- with `remove_*_policy` + `add_*_policy` (or `alter_job`) without another migration.
SELECT add_compression_policy('device_positions', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_retention_policy('device_positions', INTERVAL '12 months', if_not_exists => TRUE);
