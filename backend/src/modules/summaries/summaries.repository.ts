import { Prisma } from '@prisma/client';
import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { runAsSystemAsync } from '../../platform/http/request-context.js';
import type { SummaryGranularity, SummaryWindow } from './summaries.types.js';

/**
 * PHP `is_numeric()`-equivalent filter on `jsonb_each_text`'s text output
 * (D-0074): optional sign, digits with an optional decimal point, optional
 * exponent. `device_values.values` is already filtered to attribute keys
 * at write time (`PayloadMapper`, module 2.4) — this only excludes
 * non-numeric *values* (e.g. a string enum reading), matching
 * `generateHourlySummary.php`'s own `is_numeric($val)` guard, the one part
 * of the old job's logic this replacement keeps (everything else about
 * the old jobs — the wrong key-prefix filter, the never-scheduled command,
 * the hierarchical daily-from-hourly/weekly-from-daily rollup — is not
 * ported; see D-0074).
 */
const NUMERIC_VALUE_PATTERN = '^[+-]?(\\d+(\\.\\d+)?|\\.\\d+)([eE][+-]?\\d+)?$';

/**
 * All Prisma access for module 2.8. No request-context user — these run
 * from BullMQ repeatable jobs (`main.scheduler.ts`), same as module 2.4's
 * ingestion pipeline; `runAsSystemAsync` here is not a bypass of a check
 * that should exist, there is no per-tenant scoping on `device_values`/
 * `device_value_summaries_*` to begin with (`tenant-rules.ts`: only
 * `device_values` is even ruled, and only as `parent:devices` for cascade
 * deletes elsewhere, not for reads).
 */
export class SummariesRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  /**
   * Deletes the window's existing rows, then recomputes it directly from
   * `device_values` in one grouped aggregate query — not an `ON CONFLICT`
   * upsert (the frozen schema has no unique constraint on `(device_id,
   * attribute_type, <period>)` to target) and not a hierarchical roll-up
   * from the next-finer granularity (D-0074: independent per-tier
   * computation avoids compounding rounding/staleness and is what the
   * task file's own golden-pair guidance — compare against a hand-computed
   * expectation from raw rows — assumes). Both statements run in one
   * transaction so a concurrent read never observes an empty window
   * mid-refresh.
   *
   * `weekLabels`/`monthLabels` are required (and must be non-empty) for
   * the `weekly`/`monthly` granularities: `week`/`month` are `varchar`
   * columns holding a formatted label (`IYYY-"W"IW` / `YYYY-MM`), not a
   * real date/timestamp, so the DELETE can't use `window.start`/`.end`
   * directly — the caller (`summaries.service.ts`) computes the exact
   * label set the window covers via Luxon, which is also what keeps the
   * label format itself out of SQL entirely except in the one `to_char`
   * call that produces it for the INSERT.
   */
  async refreshWindow(params: {
    granularity: SummaryGranularity;
    window: SummaryWindow;
    weekLabels?: string[] | undefined;
    monthLabels?: string[] | undefined;
  }): Promise<void> {
    const { granularity, window } = params;

    await runAsSystemAsync(() =>
      this.prisma.$transaction(async tx => {
        switch (granularity) {
          case 'hourly': {
            await tx.$executeRaw`DELETE FROM device_value_summaries_hourly WHERE hour >= ${window.start} AND hour < ${window.end}`;
            await tx.$executeRaw`
              INSERT INTO device_value_summaries_hourly (device_id, attribute_type, hour, avg, data_points, created_at, updated_at)
              SELECT dv.device_id, kv.key, date_trunc('hour', dv.created_at), avg(kv.value::double precision), count(*)::int, now(), now()
              FROM device_values dv, jsonb_each_text(dv.values) AS kv(key, value)
              WHERE dv.created_at >= ${window.start} AND dv.created_at < ${window.end}
                AND kv.value ~ ${NUMERIC_VALUE_PATTERN}
              GROUP BY dv.device_id, kv.key, date_trunc('hour', dv.created_at)
            `;
            return;
          }
          case 'daily': {
            await tx.$executeRaw`DELETE FROM device_value_summaries_daily WHERE day >= ${window.start}::date AND day < ${window.end}::date`;
            await tx.$executeRaw`
              INSERT INTO device_value_summaries_daily (device_id, attribute_type, day, avg, data_points, created_at, updated_at)
              SELECT dv.device_id, kv.key, date_trunc('day', dv.created_at)::date, avg(kv.value::double precision), count(*)::int, now(), now()
              FROM device_values dv, jsonb_each_text(dv.values) AS kv(key, value)
              WHERE dv.created_at >= ${window.start} AND dv.created_at < ${window.end}
                AND kv.value ~ ${NUMERIC_VALUE_PATTERN}
              GROUP BY dv.device_id, kv.key, date_trunc('day', dv.created_at)
            `;
            return;
          }
          case 'weekly': {
            const labels = params.weekLabels ?? [];
            if (labels.length === 0) return;
            await tx.$executeRaw`DELETE FROM device_value_summaries_weekly WHERE week IN (${Prisma.join(labels)})`;
            await tx.$executeRaw`
              INSERT INTO device_value_summaries_weekly (device_id, attribute_type, week, avg, data_points, created_at, updated_at)
              SELECT dv.device_id, kv.key, to_char(date_trunc('week', dv.created_at), 'IYYY-"W"IW'), avg(kv.value::double precision), count(*)::int, now(), now()
              FROM device_values dv, jsonb_each_text(dv.values) AS kv(key, value)
              WHERE dv.created_at >= ${window.start} AND dv.created_at < ${window.end}
                AND kv.value ~ ${NUMERIC_VALUE_PATTERN}
              GROUP BY dv.device_id, kv.key, to_char(date_trunc('week', dv.created_at), 'IYYY-"W"IW')
            `;
            return;
          }
          case 'monthly': {
            const labels = params.monthLabels ?? [];
            if (labels.length === 0) return;
            await tx.$executeRaw`DELETE FROM device_value_summaries_monthly WHERE month IN (${Prisma.join(labels)})`;
            await tx.$executeRaw`
              INSERT INTO device_value_summaries_monthly (device_id, attribute_type, month, avg, data_points, created_at, updated_at)
              SELECT dv.device_id, kv.key, to_char(date_trunc('month', dv.created_at), 'YYYY-MM'), avg(kv.value::double precision), count(*)::int, now(), now()
              FROM device_values dv, jsonb_each_text(dv.values) AS kv(key, value)
              WHERE dv.created_at >= ${window.start} AND dv.created_at < ${window.end}
                AND kv.value ~ ${NUMERIC_VALUE_PATTERN}
              GROUP BY dv.device_id, kv.key, to_char(date_trunc('month', dv.created_at), 'YYYY-MM')
            `;
          }
        }
      })
    );
  }
}
