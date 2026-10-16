-- D-0194 (fleet analytics, flow 07 ask D1, owner "option A - yes, build it"): the hourly vehicle telemetry rollup. One row per vehicle per UTC hour,
-- filled by the `fleet-telemetry-rollup` worker job from `device_positions` (attributed to the vehicle the device was assigned to at that moment):
-- packets, distance driven, moving / stopped seconds (only for the time the packets can vouch for), max speed, first / last packet time.
-- Reports (B4 utilisation) read these rows instead of scanning raw packets; daily / weekly / monthly figures are sums of the hours in the company
-- timezone. Nothing is deleted from `device_positions`; the rows are re-computed idempotently, so the table can be dropped and rebuilt any time.
--
-- TimescaleDB: the table is created as a HYPERTABLE (partitioned on `hour_start`, 7-day chunks) with compression after 30 days (segmented by
-- vehicle_id) — the enterprise-scale shape for one row per vehicle per hour (10 000 vehicles = ~88 million rows a year); on a small fleet it costs nothing.
-- There is NO retention policy: the rollups are small and are the long-lived history once the raw positions get a retention policy (an owner decision).
-- It lives in this file (not in `platform/timeseries/migrations/`) because bootstrap applies the Timescale files BEFORE the manual ones, i.e. before this
-- table exists; the conversion is skipped on a PostgreSQL without the TimescaleDB extension (the table still works, just unpartitioned).
--
-- Also declared in `schema.prisma` (scalar fields, no Prisma relation), so a database created by `prisma db push` already has the table;
-- every statement is guarded (IF NOT EXISTS) and safe to re-run (D-0094).
CREATE TABLE IF NOT EXISTS "vehicle_hourly_stats" (
  "vehicle_id"       BIGINT NOT NULL,
  "hour_start"       TIMESTAMP(0) NOT NULL,
  "company_id"       BIGINT NOT NULL,
  "packets"          INTEGER NOT NULL DEFAULT 0,
  "distance_km"      DECIMAL(12,3) NOT NULL DEFAULT 0,
  "moving_seconds"   INTEGER NOT NULL DEFAULT 0,
  "stopped_seconds"  INTEGER NOT NULL DEFAULT 0,
  "max_speed_kmh"    DECIMAL(6,2) NULL,
  "first_packet_at"  TIMESTAMP(0) NULL,
  "last_packet_at"   TIMESTAMP(0) NULL,
  "created_at"       TIMESTAMP(0) NULL,
  "updated_at"       TIMESTAMP(0) NULL,
  PRIMARY KEY ("vehicle_id", "hour_start")
);

CREATE INDEX IF NOT EXISTS "vehicle_hourly_stats_company_id_hour_start_index" ON "vehicle_hourly_stats" ("company_id", "hour_start");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_hourly_stats_vehicle_id_foreign') THEN
    ALTER TABLE "vehicle_hourly_stats"
      ADD CONSTRAINT "vehicle_hourly_stats_vehicle_id_foreign" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_hourly_stats_company_id_foreign') THEN
    ALTER TABLE "vehicle_hourly_stats"
      ADD CONSTRAINT "vehicle_hourly_stats_company_id_foreign" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable('vehicle_hourly_stats', 'hour_start', chunk_time_interval => INTERVAL '7 days', migrate_data => TRUE, if_not_exists => TRUE);
    ALTER TABLE "vehicle_hourly_stats" SET (
      timescaledb.compress,
      timescaledb.compress_segmentby = 'vehicle_id',
      timescaledb.compress_orderby = 'hour_start DESC'
    );
    PERFORM add_compression_policy('vehicle_hourly_stats', INTERVAL '30 days', if_not_exists => TRUE);
  END IF;
END $$;
