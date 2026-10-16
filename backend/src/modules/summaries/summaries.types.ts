/**
 * Module 2.8 (KNOWN_ISSUES 11.8, D-0074). `device_value_summaries_{hourly,
 * daily,weekly,monthly}` stay the plain tables the frozen schema already
 * declares — see D-0074 for why literal Timescale continuous aggregates
 * (`CREATE MATERIALIZED VIEW ... WITH (timescaledb.continuous)`) turned out
 * infeasible over `device_values` (its `values` column is a per-attribute
 * JSONB blob; expanding it needs `jsonb_each_text`, a set-returning
 * function, which Timescale's continuous-aggregate view definitions
 * reject outright). Each granularity is instead a scheduled BullMQ job
 * that recomputes a trailing window directly from `device_values` — a
 * plain SQL delete-then-insert, not an upsert (no unique constraint on
 * `(device_id, attribute_type, <period>)` exists in the frozen schema to
 * target with `ON CONFLICT`, and a window rebuild is trivially idempotent
 * without one).
 */
export type SummaryGranularity = 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface SummaryWindow {
  /** Inclusive. */
  start: Date;
  /** Exclusive. */
  end: Date;
}
