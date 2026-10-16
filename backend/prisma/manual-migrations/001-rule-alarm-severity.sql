-- D-0060 (module 2.5 rules): severity capture on `rules`/`alarms`, neither
-- of which had it anywhere in the frozen schema (KNOWN_ISSUES 11.1 root
-- cause). Applied by hand against the dev DB 2026-09-15 in two pieces
-- (see D-0064) — this file is the recorded, replayable artifact of that
-- change.
--
-- Why this isn't a real `prisma migrate`/`db push` run: this project has
-- no `prisma/migrations` history (never baselined, despite
-- CONVENTIONS.md's stated intent — a pre-existing gap, not introduced
-- here, see D-0064/HANDOFF.md), and D-0057's hypertable conversion left
-- `device_values`'s live composite primary key permanently diverged from
-- `schema.prisma`'s single-column declaration on purpose. Both Prisma
-- schema-diffing commands plan changes for the *entire* schema in one
-- pass, so every future schema change — however unrelated — will keep
-- including a `device_values` primary-key "fix" that Postgres then
-- rejects ("operation not supported on hypertables that have compression
-- enabled"). Confirmed during this module: `prisma db push` applied this
-- migration's `alarms` column and the `rule_severity` enum type, then
-- aborted on the `device_values` step, silently leaving `rules.severity`
-- un-added — not atomic across the whole plan the way a clean failure
-- would suggest. The fix applied for `rules.severity` here was a single
-- targeted `ALTER TABLE`, run directly, exactly as this file replays.
--
-- Made idempotent 2026-09-16 (D-0094, Phase 7 bootstrap work): `severity`
-- is ALSO already declared in `schema.prisma` (both `rules`/`alarms`), so
-- a genuinely fresh database created via `prisma db push` already has
-- these columns/this type from that single pass — running this file
-- unconditionally afterward (as the Phase 7 bootstrap sequence must be
-- able to, on both a brand-new DB and an old already-migrated one) would
-- otherwise fail outright ("column already exists" / "type already
-- exists"). Guarded so this file is safe to run in either case.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rule_severity') THEN
    CREATE TYPE "rule_severity" AS ENUM ('info', 'warning', 'critical');
  END IF;
END $$;

ALTER TABLE "alarms" ADD COLUMN IF NOT EXISTS "severity" "rule_severity" NOT NULL DEFAULT 'warning';

ALTER TABLE "rules" ADD COLUMN IF NOT EXISTS "severity" "rule_severity" NOT NULL DEFAULT 'warning';
