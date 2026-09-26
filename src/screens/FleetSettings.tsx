/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  CalendarClock,
  Clock,
  Lock,
  Radio,
  Ruler,
  RotateCcw,
  Target,
  Wrench,
} from 'lucide-react';
import { put } from '@utils/apiHelper';
import { invalidateFleetQueries } from '@utils/fleetCache';
import { fullName, when } from '@components/AuditLine';
import { decimal } from '@components/analytics/format';
import { useFleetCurrency } from '@utils/fleetCurrency';
import { useEditConflict } from '@hooks/useEditConflict';
import { useFleetSettings, type FleetSettings } from '@hooks/useFleetSettings';
import { detectTimezone } from '@hooks/useDetectedTimezone';
import {
  UNIT_SYSTEMS,
  toDisplayString,
  toMetric,
  unitsFor,
  type UnitSystem,
  type Units,
} from '@utils/units';
import PageScroller from '@components/analytics/PageScroller';
import { Skeleton, ErrorState } from '@components/analytics/states';
import {
  NumberField,
  TimezoneCombobox,
  listZones,
  nowIn,
} from '@components/fleetSettings/controls';

/* ------------------------------------------------------------------------------ field model */

type NumKey =
  | 'position_freshness_minutes'
  | 'idle_threshold_minutes'
  | 'scheduled_hours_per_vehicle_per_day'
  | 'on_time_grace_minutes'
  | 'maintenance_due_soon_days'
  | 'maintenance_due_soon_km'
  | 'utilisation_target_pct'
  | 'on_time_target_pct'
  | 'cost_per_km_target'
  | 'idle_limit_pct'
  | 'fuel_economy_target';

interface NumDef {
  key: NumKey;
  label: string | ((u: Units) => string);
  description: string | ((u: Units) => string);
  /** Unit label; for `qty` fields it is derived from the company's unit system instead. */
  unit: string;
  /** Stored in metric: shown / typed in the company's unit system and converted on save. */
  qty?: 'distance' | 'perDistance' | 'economy';
  min: number;
  max?: number;
  integer?: boolean;
  step?: number;
  nullable?: boolean;
  /** true = the dashboards already read it; false = stored now, used by the upcoming reports. */
  live: boolean;
  placeholder?: string;
}

const DEFAULTS: Record<string, string> = {
  timezone: 'UTC',
  unit_system: 'metric',
  position_freshness_minutes: '15',
  idle_threshold_minutes: '5',
  scheduled_hours_per_vehicle_per_day: '24',
  on_time_grace_minutes: '0',
  maintenance_due_soon_days: '7',
  maintenance_due_soon_km: '500',
  utilisation_target_pct: '',
  on_time_target_pct: '',
  cost_per_km_target: '',
  idle_limit_pct: '',
  fuel_economy_target: '',
};

const TRACKING: NumDef[] = [
  {
    key: 'position_freshness_minutes',
    label: 'Position freshness',
    description:
      'A tracker that has not reported for longer than this is shown as Offline — on the map, the Overview and every report.',
    unit: 'minutes',
    min: 1,
    max: 1440,
    integer: true,
    live: true,
  },
  {
    key: 'idle_threshold_minutes',
    label: 'Idle threshold',
    description:
      'How long a vehicle may stand still with its engine on before it counts as idling rather than stopped.',
    unit: 'minutes',
    min: 1,
    max: 1440,
    integer: true,
    live: false,
  },
];

const OPERATIONS: NumDef[] = [
  {
    key: 'scheduled_hours_per_vehicle_per_day',
    label: 'Scheduled hours per vehicle',
    description:
      'Hours a vehicle is expected to be available each day. Utilisation is measured against this (24 = round the clock).',
    unit: 'hours / day',
    min: 1,
    max: 24,
    step: 0.5,
    live: true,
  },
  {
    key: 'on_time_grace_minutes',
    label: 'On-time grace',
    description:
      'A trip that arrives up to this long after its planned end still counts as on time.',
    unit: 'minutes',
    min: 0,
    max: 1440,
    integer: true,
    live: true,
  },
];

const MAINTENANCE: NumDef[] = [
  {
    key: 'maintenance_due_soon_days',
    label: 'Due-soon window (time)',
    description: 'Service and documents expiring within this many days are flagged “due soon”.',
    unit: 'days',
    min: 0,
    max: 365,
    integer: true,
    live: false,
  },
  {
    key: 'maintenance_due_soon_km',
    label: 'Due-soon window (distance)',
    description: u =>
      `Service due within this many ${u.distance.label === 'mi' ? 'miles' : 'kilometres'} of odometer is flagged “due soon”.`,
    unit: 'km',
    qty: 'distance',
    min: 0,
    max: 100000,
    integer: true,
    step: 50,
    live: false,
  },
];

const targets = (currency: string): NumDef[] => [
  {
    key: 'utilisation_target_pct',
    label: 'Utilisation target',
    description: 'Drawn as a target line on the utilisation trend.',
    unit: '%',
    min: 0,
    max: 100,
    nullable: true,
    live: true,
    placeholder: 'No target',
  },
  {
    key: 'on_time_target_pct',
    label: 'On-time delivery target',
    description: 'Share of completed trips that should arrive on time.',
    unit: '%',
    min: 0,
    max: 100,
    nullable: true,
    live: false,
    placeholder: 'No target',
  },
  {
    key: 'cost_per_km_target',
    label: u => `Cost per ${u.distance.label} target`,
    description: u =>
      `Fuel, maintenance and other running costs per ${u.distance.label === 'mi' ? 'mile' : 'kilometre'} driven — lower is better.`,
    unit: `${currency} / km`,
    qty: 'perDistance',
    min: 0,
    nullable: true,
    step: 0.5,
    live: false,
    placeholder: 'No target',
  },
  {
    key: 'idle_limit_pct',
    label: 'Idle limit',
    description: 'Highest acceptable share of engine-on time spent idling.',
    unit: '%',
    min: 0,
    max: 100,
    nullable: true,
    live: false,
    placeholder: 'No limit',
  },
  {
    key: 'fuel_economy_target',
    label: 'Fuel economy target',
    description: u =>
      u.economy.label === 'km/L'
        ? 'Kilometres per litre the fleet should reach — higher is better.'
        : 'Miles per gallon the fleet should reach — higher is better.',
    unit: 'km / L',
    qty: 'economy',
    min: 0,
    nullable: true,
    step: 0.5,
    live: false,
    placeholder: 'No target',
  },
];

const UNIT_NAMES: Record<UnitSystem, string> = {
  metric: 'Metric',
  us: 'US customary',
  uk: 'UK',
};

const toStr = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/** Metric value → the string a field shows (conversion only for `qty` fields). */
const shown = (d: NumDef, units: Units, metric: unknown): string =>
  d.qty ? toDisplayString(units[d.qty], metric as number | string | null, 2) : toStr(metric);

/** Client-side mirror of the backend's 422 rules — the server stays the authority. Bounds are METRIC. */
const check = (def: NumDef, raw: string, units: Units): string | null => {
  if (raw.trim() === '') return def.nullable ? null : 'Required';

  const typed = Number(raw);

  if (!Number.isFinite(typed)) return 'Enter a number';

  if (def.integer && !def.qty && !Number.isInteger(typed)) return 'Whole numbers only';

  const n = def.qty ? units[def.qty].to(typed) : typed;
  const bound = (v: number) =>
    Number(def.qty ? toDisplayString(units[def.qty], v, 1) : v).toLocaleString();

  if (n < def.min - 1e-9) return `Must be at least ${bound(def.min)}`;

  if (def.max !== undefined && n > def.max + 1e-9) return `Must be at most ${bound(def.max)}`;

  return null;
};

/* ---------------------------------------------------------------------------- presentation */

function LiveChip({ live }: { live: boolean }) {
  return live ? (
    <span
      title="Dashboards and reports already use this setting."
      className="inline-flex items-center gap-1 text-[10px] font-medium text-ink-1 bg-surface-2 border border-line-soft rounded-full px-1.5 py-px"
    >
      <span className="w-1 h-1 rounded-full bg-[#0ca30c]" /> In use
    </span>
  ) : (
    <span
      title="Saved now; the analytics reports that read it are coming next."
      className="inline-flex items-center gap-1 text-[10px] font-medium text-ink-2 bg-surface-2 border border-line-soft rounded-full px-1.5 py-px"
    >
      <span className="w-1 h-1 rounded-full bg-ink-2" /> Used by upcoming reports
    </span>
  );
}

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="glass">
      <header className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-line-soft">
        <span className="mt-0.5 flex items-center justify-center w-8 h-8 rounded-lg bg-surface-2 border border-line-soft text-ink-1">
          {icon}
        </span>
        <div>
          <h2 className="text-sm font-semibold text-ink-0">{title}</h2>
          <p className="text-xs text-ink-1 mt-0.5">{description}</p>
        </div>
      </header>
      <div className="divide-y divide-line-soft">{children}</div>
    </section>
  );
}

function Row({
  htmlFor,
  label,
  description,
  live,
  error,
  hint,
  onReset,
  children,
}: {
  htmlFor: string;
  label: string;
  description: string;
  live: boolean;
  error?: string | null;
  hint?: ReactNode;
  onReset?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-3 px-6 py-4">
      <div className="flex-1 min-w-[260px] max-w-[560px]">
        <div className="flex items-center gap-2">
          <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-0">
            {label}
          </label>
          <LiveChip live={live} />
        </div>
        <p className="text-xs leading-relaxed text-ink-1 mt-1">{description}</p>
      </div>
      <div className="w-[320px] max-w-full">
        {children}
        <div className="flex items-start justify-between gap-3 mt-1.5 min-h-[16px]">
          <div id={`${htmlFor}-note`} className="text-[11.5px]">
            {error ? (
              <span role="alert" className="text-danger">
                {error}
              </span>
            ) : (
              <span className="text-ink-2">{hint}</span>
            )}
          </div>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] text-ink-2 hover:text-ink-0 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan rounded"
            >
              <RotateCcw size={10} /> Default
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------------- the form */

function SettingsForm({ settings, onReload }: { settings: FleetSettings; onReload: () => void }) {
  const qc = useQueryClient();
  const currency = useFleetCurrency();
  const conflict = useEditConflict(settings, onReload);
  // The fields below are shown in the company's SAVED unit system; a unit change picked in this form only
  // applies after Save (the form then re-mounts on the new record).
  const units = useMemo(() => unitsFor(settings.unit_system), [settings.unit_system]);
  const hasUnits = settings.unit_system !== undefined;

  const initial = useMemo<Record<string, string>>(
    () => ({
      timezone: settings.timezone,
      ...(hasUnits ? { unit_system: settings.unit_system as string } : {}),
      ...Object.fromEntries(
        [...TRACKING, ...OPERATIONS, ...MAINTENANCE, ...targets(currency)].map(d => [
          d.key,
          shown(d, units, settings[d.key]),
        ])
      ),
    }),
    // `currency` only changes a label; the values come from the record captured at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings]
  );
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [, tick] = useState(0);

  // Keep the "now in <zone>" preview alive.
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 20_000);

    return () => clearInterval(t);
  }, []);

  const defs = useMemo(
    () => [...TRACKING, ...OPERATIONS, ...MAINTENANCE, ...targets(currency)],
    [currency]
  );
  const set = (key: string, v: string) => {
    setValues(s => ({ ...s, [key]: v }));
    setServerErrors(e => {
      if (!e[key]) return e;

      const { [key]: _drop, ...rest } = e;

      return rest;
    });
  };

  const errors = useMemo(() => {
    const out: Record<string, string> = {};

    defs.forEach(d => {
      const msg = check(d, values[d.key], units);

      if (msg) out[d.key] = msg;
    });

    return { ...out, ...serverErrors };
  }, [defs, values, serverErrors, units]);

  const changed = Object.keys(values).filter(k => values[k] !== initial[k]);
  const dirty = changed.length > 0;
  const invalid = Object.keys(errors).length > 0;
  const zoneChanged = values.timezone !== initial.timezone;

  // Leaving with unsaved edits: the browser's own prompt (tab close / reload).
  useEffect(() => {
    if (!dirty) return;

    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', h);

    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const save = async () => {
    if (!dirty || invalid) return;

    const payload: Record<string, unknown> = {};

    changed.forEach(k => {
      const def = defs.find(d => d.key === k);

      if (k === 'timezone' || k === 'unit_system') payload[k] = values[k];
      else if (values[k].trim() === '') payload[k] = null;
      else if (def?.qty) {
        const metric = toMetric(units[def.qty], values[k]) as number;

        // The backend stores whole numbers for integer fields (e.g. 300 mi → 483 km).
        payload[k] = def.integer ? Math.round(metric) : Math.round(metric * 1000) / 1000;
      } else payload[k] = Number(values[k]);
    });

    setSaving(true);

    const res: any = await put(
      '/api/fleet/settings',
      { ...payload, ...conflict.expected },
      {},
      false
    );

    setSaving(false);

    if (conflict.handle(res)) {
      // The banner sits at the top of the form, out of sight when Save was pressed further down.
      toast.error('Someone else changed these settings first — nothing was saved.');
      setTimeout(
        () =>
          document
            .querySelector('[data-testid="conflict-banner"]')
            ?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
        50
      );

      return;
    }

    if (res?.error || res?.success === false) {
      if (res?.errors) {
        setServerErrors(
          Object.fromEntries(
            Object.entries(res.errors).map(([k, v]) => [
              k,
              ([] as string[]).concat(v as any).join(' '),
            ])
          )
        );
        toast.error('Some settings were refused — check the highlighted fields.');
      } else {
        toast.error(res?.message || 'Could not save the settings.');
      }

      return;
    }

    toast.success('Fleet settings saved.');
    // Refetches the settings and every dashboard query that depends on them; the form re-mounts on the
    // new `updated_at` (see the `key` below) so it starts clean and re-captures the concurrency token.
    invalidateFleetQueries(qc);
  };

  const discard = () => {
    setValues(initial);
    setServerErrors({});
  };

  const tzMeta = listZones().find(z => z.id === values.timezone);
  const detected = detectTimezone();

  const unitLabel = (d: NumDef) =>
    d.qty === 'distance'
      ? units.distance.label
      : d.qty === 'perDistance'
        ? `${currency} / ${units.perDistance.label}`
        : d.qty === 'economy'
          ? units.economy.label
          : d.unit;

  const numRow = (d: NumDef) => {
    const unit = unitLabel(d);
    const def = d.qty ? toDisplayString(units[d.qty], DEFAULTS[d.key], 2) : DEFAULTS[d.key];
    const hint = def !== '' ? `Default ${def} ${unit}` : 'Optional';
    const lo = d.qty ? Number(toDisplayString(units[d.qty], d.min, 2)) : d.min;
    const hi =
      d.max === undefined
        ? undefined
        : d.qty
          ? Number(toDisplayString(units[d.qty], d.max, 2))
          : d.max;

    return (
      <Row
        key={d.key}
        htmlFor={d.key}
        label={typeof d.label === 'function' ? d.label(units) : d.label}
        description={typeof d.description === 'function' ? d.description(units) : d.description}
        live={d.live}
        error={errors[d.key]}
        hint={hint}
        onReset={values[d.key] !== def ? () => set(d.key, def) : undefined}
      >
        <NumberField
          id={d.key}
          value={values[d.key]}
          onChange={v => set(d.key, v)}
          unit={unit}
          min={lo}
          max={hi}
          step={d.step ?? 1}
          placeholder={d.placeholder}
          invalid={!!errors[d.key]}
          describedBy={`${d.key}-note`}
          clearable={d.nullable}
        />
      </Row>
    );
  };

  return (
    <>
      <div className="mx-auto w-full max-w-[980px] px-6 pt-6 pb-28 flex flex-col gap-5">
        {conflict.banner}

        <Section
          icon={<Clock size={16} />}
          title="Company time"
          description="Decides where each day, week and month starts in every report."
        >
          <Row
            htmlFor="timezone"
            label="Company timezone"
            description="Reports bucket by calendar days in this zone, and date ranges (“Today”, “Last 7 days”) are read in it. Until it is set, everything runs in UTC."
            live
            error={errors.timezone}
            onReset={
              values.timezone !== DEFAULTS.timezone
                ? () => set('timezone', DEFAULTS.timezone)
                : undefined
            }
            hint={
              <span className="tabular-nums">
                Now in {values.timezone}:{' '}
                <span className="text-ink-1">{nowIn(values.timezone)}</span>
                {detected &&
                  detected !== values.timezone &&
                  listZones().some(z => z.id === detected) && (
                    <>
                      {' · '}
                      <button
                        type="button"
                        onClick={() => set('timezone', detected)}
                        className="text-brand-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan rounded"
                      >
                        Use this browser’s ({detected})
                      </button>
                    </>
                  )}
              </span>
            }
          >
            <TimezoneCombobox
              id="timezone"
              value={values.timezone}
              onChange={v => set('timezone', v)}
              invalid={!!errors.timezone}
              describedBy="timezone-note"
            />
          </Row>
          {zoneChanged && (
            <div
              role="note"
              className="flex items-start gap-2.5 px-6 py-3 bg-[color-mix(in_srgb,#fab219_10%,transparent)] text-xs text-ink-0"
            >
              <AlertTriangle size={14} className="mt-px shrink-0 text-[#c98500]" />
              <span>
                Days will start at midnight in <strong>{tzMeta?.id ?? values.timezone}</strong>
                {tzMeta ? ` (${tzMeta.offset})` : ''}. Past figures are not deleted, but they move
                to the new calendar: a trip near midnight can land on a different day, and daily,
                weekly and monthly totals will shift.
              </span>
            </div>
          )}
        </Section>

        {hasUnits && (
          <Section
            icon={<Ruler size={16} />}
            title="Units"
            description="How distances, fuel and speeds are shown and typed across Fleet. Stored data is never changed."
          >
            <div className="px-6 py-4">
              <div
                role="radiogroup"
                aria-label="Unit system"
                className="grid gap-3"
                style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
              >
                {UNIT_SYSTEMS.map(sys => {
                  const u = unitsFor(sys);
                  const on = values.unit_system === sys;

                  return (
                    <button
                      key={sys}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => set('unit_system', sys)}
                      className={`text-left rounded-xl border p-3.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan ${
                        on
                          ? 'border-accent-cyan bg-accent-cyan/5'
                          : 'border-line hover:border-ink-2 bg-surface-1'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-semibold text-ink-0">
                          {UNIT_NAMES[sys]}
                        </span>
                        <span
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            on ? 'border-accent-cyan' : 'border-line'
                          }`}
                        >
                          {on && <span className="w-2 h-2 rounded-full bg-accent-cyan" />}
                        </span>
                      </div>
                      <div className="text-[11.5px] text-ink-1 mt-1">
                        {u.distance.label} · {u.volume.label} · {u.economy.label} · {u.speed.label}
                      </div>
                      <div className="text-[11px] text-ink-2 mt-2 tabular-nums leading-relaxed">
                        100 km = {decimal(u.distance.from(100), 1)} {u.distance.label}
                        <br />
                        40 L = {decimal(u.volume.from(40), 1)} {u.volume.label}
                        <br />8 km/L = {decimal(u.economy.from(8), 1)} {u.economy.label}
                      </div>
                    </button>
                  );
                })}
              </div>
              {values.unit_system !== initial.unit_system && (
                <p role="note" className="mt-3 text-xs text-ink-1">
                  Saving switches every Fleet screen to{' '}
                  {UNIT_NAMES[values.unit_system as UnitSystem]}. The fields below are converted the
                  next time this page opens.
                </p>
              )}
            </div>
          </Section>
        )}

        <Section
          icon={<Radio size={16} />}
          title="Live tracking"
          description="How the live fleet status is worked out from tracker reports."
        >
          {TRACKING.map(numRow)}
        </Section>

        <Section
          icon={<CalendarClock size={16} />}
          title="Working day & delivery"
          description="The yardsticks utilisation and on-time delivery are measured against."
        >
          {OPERATIONS.map(numRow)}
        </Section>

        <Section
          icon={<Wrench size={16} />}
          title="Maintenance planning"
          description="When upcoming service and expiring documents start to count as due soon."
        >
          {MAINTENANCE.map(numRow)}
        </Section>

        <Section
          icon={<Target size={16} />}
          title="Targets"
          description="Optional. Set a target to see it as a line on the charts and to colour the deltas; leave a field empty for none."
        >
          {targets(currency).map(numRow)}
        </Section>

        <p className="text-[11.5px] text-ink-2 flex items-center gap-1.5">
          <Lock size={11} /> Needs the Fleet permission. Every save is recorded with your name and
          time, and refused if someone else changed the settings after you opened this page.
        </p>
      </div>

      {/* Save bar — pinned under the scroller while there is something to save. */}
      <div
        aria-hidden={!dirty}
        inert={!dirty}
        className={`absolute inset-x-0 bottom-0 z-20 transition-all duration-200 ${
          dirty ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
        }`}
      >
        <div className="mx-auto max-w-[980px] px-6 pb-5">
          <div className="flex items-center justify-between gap-4 glass-strong px-4 py-3">
            <div className="text-[13px] text-ink-0">
              <span className="font-semibold tabular-nums">{changed.length}</span> unsaved{' '}
              {changed.length === 1 ? 'change' : 'changes'}
              {invalid && (
                <span className="text-danger-text ml-2 text-xs">
                  Fix the highlighted fields to save
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={discard}
                disabled={saving}
                className="text-xs font-medium text-ink-1 hover:text-ink-0 px-3 py-2 rounded-md hover:bg-surface-2 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || invalid || conflict.conflicted}
                className="text-xs font-semibold text-white bg-accent-cyan rounded-md px-4 py-2 disabled:opacity-40 hover:brightness-110 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-cyan"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------------------- the page */

export default function FleetSettings() {
  const { settings, isLoading, error, refetch } = useFleetSettings();
  const author = fullName(settings?.updated_by_user);

  return (
    <PageScroller footer={null} className="[scrollbar-gutter:stable]">
      <div className="mx-auto w-full max-w-[980px] px-6 pt-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="page-title">Fleet settings</h1>
            <p className="text-[13px] text-ink-1 mt-1">
              Company-wide rules that every Fleet dashboard and report reads.
            </p>
          </div>
          {settings && (
            <span className="text-[11.5px] text-ink-1 bg-surface-2 border border-line-soft rounded-full px-3 py-1">
              {settings.is_default || !settings.updated_at
                ? 'Using the defaults — nothing saved yet'
                : `Last saved ${when(settings.updated_at)}${author ? ` by ${author}` : ''}`}
            </span>
          )}
        </div>
      </div>

      {isLoading && (
        <div
          className="mx-auto w-full max-w-[980px] px-6 pt-6 flex flex-col gap-5"
          aria-busy="true"
        >
          {[150, 250, 230].map((h, i) => (
            <Skeleton key={i} className="w-full rounded-xl" style={{ height: h }} />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="mx-auto w-full max-w-[980px] px-6 pt-6">
          <ErrorState
            message={
              error.status === 403
                ? 'You need the Fleet permission to view or change these settings.'
                : error.message || 'Could not load the fleet settings.'
            }
            onRetry={error.status === 403 ? undefined : () => refetch()}
          />
        </div>
      )}

      {settings && (
        // Re-mounts on a new `updated_at` (after a save or "Reload latest") so the form starts clean
        // and re-captures its concurrency token — and when the unit system arrives / changes, because the
        // fields are shown in that system.
        <SettingsForm
          key={`${settings.updated_at ?? 'defaults'}:${settings.unit_system ?? '-'}`}
          settings={settings}
          onReload={() => refetch()}
        />
      )}
    </PageScroller>
  );
}
