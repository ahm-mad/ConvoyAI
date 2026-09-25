// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
// FleetDashboard.jsx
import React, { useState } from 'react';
import { useNavigate } from '@lib/router-compat';
import {
  Activity,
  PauseCircle,
  ParkingSquare,
  WifiOff,
  Route,
  Fuel,
  Wallet,
  Gauge,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  CircleDot,
  HelpCircle,
  FileWarning,
  IdCard,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import ExpiringDocumentsPanel from '@components/ExpiringDocumentsPanel';
import { useTheme } from '@contexts/ThemeContext';
import DonutChart from '@components/NeonPieChart';
import { getFleetCurrency, formatFleetMoney, useFleetCurrency } from '@utils/fleetCurrency';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler
);

/**
 * Consumes the 5-endpoint Fleet Dashboard API (see "kapi dashboard.md" at
 * repo root for the full contract): overview snapshot, trends, vehicle
 * performance, alerts, financial breakdown. Real-time sections (status
 * cards, alerts) poll every 30s; everything else refetches on date-range
 * change only, matching the backend's documented refresh strategy so the
 * frontend never over-fetches historical aggregates.
 */
function toYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

const CHART_COLORS = {
  dark: {
    grid: '#181c20',
    text: '#8b95a1',
    muted: '#565f68',
    ink0: '#e8ebee',
    cyan: '#29d3ff',
    green: '#17d68c',
    danger: '#ff3b5c',
    warning: '#f5a623',
    surface: '#13171b',
    line: '#22282e',
  },
  light: {
    grid: '#e5e8eb',
    text: '#4c545c',
    muted: '#838c94',
    ink0: '#12151a',
    cyan: '#0075a3',
    green: '#0a8a5c',
    danger: '#d81b3f',
    warning: '#a15c05',
    surface: '#eceef1',
    line: '#d3d8dd',
  },
};

function formatDateLabel(dateStr, interval) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (interval === 'month')
    return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtNumber(n, digits = 0) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtDuration(minutes) {
  if (minutes === null || minutes === undefined) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
}

const fmtCurrency = formatFleetMoney;

export default function FleetDashboard({ onNavigateTab }) {
  const navigate = useNavigate();
  const { isLight } = useTheme();
  const colors = isLight ? CHART_COLORS.light : CHART_COLORS.dark;
  // Company currency (companies.currency) — the money helpers below read it from the store.
  useFleetCurrency();

  const [range, setRange] = useState(() => ({ from: toYMD(daysAgo(6)), to: toYMD(new Date()) }));
  const [interval, setIntervalValue] = useState('day');
  const [severity, setSeverity] = useState('all');
  const [sort, setSort] = useState({ field: 'utilisation_rate', direction: 'desc' });
  const [chartsOpen, setChartsOpen] = useState(true);

  const setPreset = days => {
    setRange({ from: toYMD(daysAgo(days - 1)), to: toYMD(new Date()) });
  };

  const {
    data: overviewData,
    isLoading: overviewLoading,
    isFetching: overviewFetching,
    refetch: refetchOverview,
  } = useSimpleQuery(
    'fleet-dashboard-overview',
    '/api/fleet/dashboard',
    // fleet_only=1 (backend D-0182, flows/06 §34): data.alerts.total / critical / warning / info count only
    // open alarms of devices installed in a vehicle now — the same rule as the Needs Attention list below,
    // so the summary counts and the list agree (the default counts every alarm of the company).
    { ...range, fleet_only: 1 },
    {
      refetchInterval: 300000,
    }
  );

  const {
    data: alertsData,
    isLoading: alertsLoading,
    refetch: refetchAlerts,
  } = useSimpleQuery(
    'fleet-dashboard-alerts',
    '/api/fleet/dashboard/alerts',
    // fleet_only=1: only alarms of devices currently installed in a vehicle (flows/05 §12.3) — the
    // default feed would mix in every IoT rule alarm of the company.
    severity === 'all' ? { fleet_only: 1 } : { severity, fleet_only: 1 },
    { refetchInterval: 300000 }
  );

  const {
    data: vehiclesData,
    isLoading: vehiclesLoading,
    refetch: refetchVehicles,
  } = useSimpleQuery(
    'fleet-dashboard-vehicle-performance',
    '/api/fleet/dashboard/vehicle-performance',
    {
      ...range,
      sort: sort.field,
      direction: sort.direction,
    }
  );

  const {
    data: financialData,
    isLoading: financialLoading,
    refetch: refetchFinancial,
  } = useSimpleQuery('fleet-dashboard-financial', '/api/fleet/dashboard/financial', range);

  const {
    data: trendsData,
    isLoading: trendsLoading,
    refetch: refetchTrends,
  } = useSimpleQuery(
    'fleet-dashboard-trends',
    '/api/fleet/dashboard/trends',
    { ...range, interval },
    { enabled: chartsOpen }
  );

  const overview = overviewData?.success ? overviewData.data : null;
  const alerts = alertsData?.success ? alertsData.data : [];
  const vehicles = vehiclesData?.success ? vehiclesData.data : [];
  const financial = financialData?.success ? financialData.data : null;
  const trends = trendsData?.success ? trendsData.data : null;

  const handleRefreshAll = () => {
    refetchOverview();
    refetchAlerts();
    refetchVehicles();
    refetchFinancial();
    if (chartsOpen) refetchTrends();
  };

  const handleSort = field => {
    setSort(prev =>
      prev.field === field
        ? { field, direction: prev.direction === 'desc' ? 'asc' : 'desc' }
        : { field, direction: 'desc' }
    );
  };

  return (
    <div className="flex flex-col p-5 h-full overflow-y-auto gap-5">
      {/* =====================================================
          HEADER — title, date range, refresh
      ====================================================== */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[15px] font-semibold text-ink-0 font-display">Fleet Dashboard</h1>
          <p className="text-xs text-ink-2 mt-0.5">
            {overview?.meta?.generated_at || overviewData?.meta?.generated_at
              ? `Updated ${new Date(overviewData.meta.generated_at).toLocaleTimeString()}`
              : 'Real-time fleet overview'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-surface-1 border border-line-soft rounded-md p-0.5">
            {[
              { label: 'Today', days: 1 },
              { label: '7D', days: 7 },
              { label: '30D', days: 30 },
            ].map(p => (
              <button
                key={p.label}
                onClick={() => setPreset(p.days)}
                className="text-[11px] font-medium px-2.5 py-1 rounded text-ink-2 hover:text-ink-0 hover:bg-surface-2"
              >
                {p.label}
              </button>
            ))}
          </div>

          <input
            type="date"
            value={range.from}
            max={range.to}
            onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
            className="bg-surface-1 border border-line rounded-md px-2 py-1.5 text-[11px] text-ink-0"
          />
          <span className="text-ink-2 text-xs">→</span>
          <input
            type="date"
            value={range.to}
            min={range.from}
            max={toYMD(new Date())}
            onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
            className="bg-surface-1 border border-line rounded-md px-2 py-1.5 text-[11px] text-ink-0"
          />

          <button
            onClick={handleRefreshAll}
            className="flex items-center gap-1.5 text-xs font-medium text-accent-cyan border border-line rounded-md px-3 py-1.5 hover:bg-surface-2"
          >
            <RefreshCw size={13} className={overviewFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* =====================================================
          FLEET STATUS CARDS — real-time, always reflects now
      ====================================================== */}
      <StatusCards
        loading={overviewLoading}
        status={overview?.fleet_status}
        onNavigateMap={() => onNavigateTab?.('map')}
      />

      {/* =====================================================
          KPI STRIP — trips / utilisation / fuel (respect range)
      ====================================================== */}
      <KpiStrip loading={overviewLoading} overview={overview} />
      <TripBreakdown loading={overviewLoading} trips={overview?.trips} />
      <UtilisationBreakdown loading={overviewLoading} util={overview?.utilisation} />

      {/* =====================================================
          NEEDS ATTENTION — alerts
      ====================================================== */}
      <AlertsPanel
        loading={alertsLoading}
        alerts={alerts}
        summary={overview?.alerts}
        severity={severity}
        onSeverityChange={setSeverity}
        onAlertClick={() => navigate('/alarms')}
      />

      {/* =====================================================
          EXPIRING DOCUMENTS — compliance paperwork expired / due within 30 days
      ====================================================== */}
      <ExpiringDocumentsPanel />

      {/* =====================================================
          TRENDS — charts, lazily fetched
      ====================================================== */}
      <div className="bg-surface-1 border border-line-soft rounded-md">
        <button
          onClick={() => setChartsOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-accent-cyan" />
            <span className="text-xs font-semibold text-ink-0">Trends</span>
          </div>
          {chartsOpen ? (
            <ChevronUp size={14} className="text-ink-2" />
          ) : (
            <ChevronDown size={14} className="text-ink-2" />
          )}
        </button>

        {chartsOpen && (
          <div className="px-4 pb-4">
            <div className="flex items-center gap-1 mb-3">
              {['day', 'week', 'month'].map(iv => (
                <button
                  key={iv}
                  onClick={() => setIntervalValue(iv)}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded capitalize ${
                    interval === iv
                      ? 'bg-accent-cyan/10 text-accent-cyan'
                      : 'text-ink-2 hover:text-ink-0'
                  }`}
                >
                  {iv}
                </button>
              ))}
            </div>

            {trendsLoading && <div className="text-xs text-ink-2 py-8 text-center">Loading…</div>}

            {!trendsLoading && trends && (
              <TrendsCharts trends={trends} interval={interval} colors={colors} />
            )}
          </div>
        )}
      </div>

      {/* =====================================================
          VEHICLE PERFORMANCE TABLE
      ====================================================== */}
      <VehiclePerformanceTable
        loading={vehiclesLoading}
        vehicles={vehicles}
        sort={sort}
        onSort={handleSort}
      />

      {/* =====================================================
          FINANCIAL BREAKDOWN
      ====================================================== */}
      <FinancialSection loading={financialLoading} financial={financial} colors={colors} />
    </div>
  );
}

/* ===========================================================
   STATUS CARDS
=========================================================== */
function StatusCards({ loading, status, onNavigateMap }) {
  const cards = [
    { key: 'total', label: 'Total', icon: CircleDot, className: 'text-ink-0' },
    { key: 'moving', label: 'Moving', icon: Activity, className: 'text-accent-green' },
    { key: 'idle', label: 'Idle', icon: PauseCircle, className: 'text-warning' },
    { key: 'parked', label: 'Parked', icon: ParkingSquare, className: 'text-accent-cyan' },
    { key: 'offline', label: 'Offline', icon: WifiOff, className: 'text-danger' },
    { key: 'unknown', label: 'Unknown', icon: HelpCircle, className: 'text-ink-2' },
    { key: 'active_trips', label: 'Active Trips', icon: Route, className: 'text-accent-cyan' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
      {cards.map(c => {
        const Icon = c.icon;
        return (
          <button
            key={c.key}
            onClick={onNavigateMap}
            className="text-left bg-surface-1 border border-line-soft rounded-md px-3.5 py-3 hover:bg-surface-2 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-ink-2">{c.label}</span>
              <Icon size={13} className={c.className} />
            </div>
            <div className="text-lg font-semibold text-ink-0 mt-1 font-display">
              {loading ? '—' : fmtNumber(status?.[c.key] ?? 0)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ===========================================================
   KPI STRIP
=========================================================== */
function StatTile({ label, value, sub, icon: Icon }) {
  return (
    <div className="bg-surface-1 border border-line-soft rounded-md px-4 py-3 flex-1 min-w-[150px]">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ink-2">
        {Icon && <Icon size={11} />}
        {label}
      </div>
      <div className="text-base font-semibold text-ink-0 mt-1 font-display">{value}</div>
      {sub && <div className="text-[11px] text-ink-2 mt-0.5">{sub}</div>}
    </div>
  );
}

function KpiStrip({ loading, overview }) {
  const trips = overview?.trips;
  const util = overview?.utilisation;
  const fuel = overview?.fuel;

  return (
    <div className="flex flex-wrap gap-2.5">
      <StatTile
        icon={Route}
        label="Trips"
        value={loading ? '—' : fmtNumber(trips?.total ?? 0)}
        sub={
          loading
            ? undefined
            : `${fmtNumber(trips?.completed ?? 0)} completed · ${
                trips?.on_time_pct != null
                  ? `${fmtNumber(trips.on_time_pct, 1)}% on-time`
                  : 'no on-time data'
              }`
        }
      />
      <StatTile
        icon={Gauge}
        label="Utilisation"
        value={loading ? '—' : util?.rate != null ? `${fmtNumber(util.rate, 1)}%` : '—'}
        sub={loading ? undefined : `${fmtNumber(util?.driving_hours ?? 0, 1)}h driving`}
      />
      <StatTile
        icon={Fuel}
        label="Fuel Used"
        value={loading ? '—' : `${fmtNumber(fuel?.used_liters ?? 0, 1)} L`}
        sub={
          loading
            ? undefined
            : `${
                fuel?.average_efficiency_km_per_liter != null
                  ? `${fmtNumber(fuel.average_efficiency_km_per_liter, 2)} km/L`
                  : 'no efficiency data'
              } · idle ${fuel?.idle_fuel_liters != null ? `${fmtNumber(fuel.idle_fuel_liters, 1)} L` : '— (pending IoT)'}`
        }
      />
      <StatTile
        icon={Wallet}
        label="Fuel Cost"
        value={loading ? '—' : fmtCurrency(fuel?.total_cost)}
        sub={
          loading
            ? undefined
            : fuel?.cost_per_km != null
              ? `${fmtNumber(fuel.cost_per_km, 1)} /km`
              : undefined
        }
      />
      <StatTile
        icon={Route}
        label="Distance"
        value={loading ? '—' : `${fmtNumber(trips?.actual_distance_km ?? 0)} km`}
        sub={
          loading
            ? undefined
            : trips?.avg_duration_minutes != null
              ? `avg ${fmtDuration(trips.avg_duration_minutes)}`
              : undefined
        }
      />
    </div>
  );
}

/* ===========================================================
   TRIP STATUS BREAKDOWN — the trips.* fields the KPI strip's
   single "Trips" tile has no room for: in_progress, cancelled,
   planned counts, plus planned vs. actual distance variance.
=========================================================== */
function TripBreakdown({ loading, trips }) {
  if (loading || !trips) return null;

  const statuses = [
    { key: 'completed', label: 'Completed', className: 'text-accent-green' },
    { key: 'in_progress', label: 'In Progress', className: 'text-accent-cyan' },
    { key: 'planned', label: 'Planned', className: 'text-ink-1' },
    { key: 'cancelled', label: 'Cancelled', className: 'text-danger' },
  ];

  return (
    <div className="bg-surface-1 border border-line-soft rounded-md px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      {statuses.map(s => (
        <div key={s.key} className="flex items-center gap-1.5 text-xs">
          <span className={`font-semibold ${s.className}`}>{fmtNumber(trips[s.key] ?? 0)}</span>
          <span className="text-ink-2">{s.label}</span>
        </div>
      ))}

      <span className="text-line hidden sm:inline">|</span>

      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-ink-2">Planned</span>
        <span className="text-ink-1 font-medium">{fmtNumber(trips.planned_distance_km, 1)} km</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-ink-2">Variance</span>
        <span
          className={`font-medium ${
            trips.distance_variance_km == null
              ? 'text-ink-2'
              : trips.distance_variance_km < 0
                ? 'text-danger'
                : 'text-accent-green'
          }`}
        >
          {trips.distance_variance_km != null
            ? `${fmtNumber(trips.distance_variance_km, 1)} km`
            : '—'}
        </span>
      </div>
    </div>
  );
}

/* ===========================================================
   UTILISATION BREAKDOWN — the utilisation.* fields the KPI
   strip's single tile skips: idle/parked/available hours and
   the range's total distance.
=========================================================== */
function UtilisationBreakdown({ loading, util }) {
  if (loading || !util) return null;

  const fields = [
    { key: 'driving_hours', label: 'Driving' },
    { key: 'idle_hours', label: 'Idle' },
    { key: 'parked_hours', label: 'Parked' },
    { key: 'available_hours', label: 'Available' },
  ];

  return (
    <div className="bg-surface-1 border border-line-soft rounded-md px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      {fields.map(f => (
        <div key={f.key} className="flex items-center gap-1.5 text-xs">
          <span className="text-ink-0 font-semibold">{fmtNumber(util[f.key] ?? 0, 1)}h</span>
          <span className="text-ink-2">{f.label}</span>
        </div>
      ))}

      <span className="text-line hidden sm:inline">|</span>

      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-ink-2">Utilisation Distance</span>
        <span className="text-ink-1 font-medium">{fmtNumber(util.distance_km, 1)} km</span>
      </div>
    </div>
  );
}

/* ===========================================================
   ALERTS PANEL
=========================================================== */
function SummaryStat({ icon: Icon, label, value, className }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      {Icon && <Icon size={11} className={className} />}
      <span className={`font-semibold ${className}`}>{fmtNumber(value ?? 0)}</span>
      <span className="text-ink-2">{label}</span>
    </div>
  );
}

const SEVERITY_STYLES = {
  critical: { dot: 'bg-danger', text: 'text-danger', bg: 'bg-danger/10' },
  warning: { dot: 'bg-warning', text: 'text-warning', bg: 'bg-warning/10' },
  info: { dot: 'bg-accent-cyan', text: 'text-accent-cyan', bg: 'bg-accent-cyan/10' },
};

function AlertsPanel({ loading, alerts, summary, severity, onSeverityChange, onAlertClick }) {
  const filters = ['all', 'critical', 'warning', 'info'];

  return (
    <div className="bg-surface-1 border border-line-soft rounded-md p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-warning" />
          <span className="text-xs font-semibold text-ink-0">Needs Attention</span>
          <span className="text-[11px] text-ink-2">{loading ? '' : `(${alerts.length})`}</span>
        </div>

        <div className="flex items-center gap-1">
          {filters.map(f => (
            <button
              key={f}
              onClick={() => onSeverityChange(f)}
              className={`text-[11px] font-medium px-2.5 py-1 rounded capitalize ${
                severity === f
                  ? 'bg-accent-cyan/10 text-accent-cyan'
                  : 'text-ink-2 hover:text-ink-0'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* overview.alerts — the fleet-wide summary counts, distinct from
          the filtered alert list below (e.g. offline_vehicles counts
          vehicles, not open alert rows). */}
      {summary && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3 pb-3 border-b border-line-soft">
          <SummaryStat label="Total" value={summary.total} className="text-ink-0" />
          <SummaryStat label="Critical" value={summary.critical} className="text-danger" />
          <SummaryStat label="Warning" value={summary.warning} className="text-warning" />
          <SummaryStat label="Info" value={summary.info} className="text-accent-cyan" />
          <SummaryStat
            icon={WifiOff}
            label="Offline Vehicles"
            value={summary.offline_vehicles}
            className="text-ink-1"
          />
          <SummaryStat
            icon={FileWarning}
            label="Expiring Documents"
            value={summary.expiring_documents}
            className="text-ink-1"
          />
          <SummaryStat
            icon={IdCard}
            label="Expiring Licences"
            value={summary.expiring_driver_licences}
            className="text-ink-1"
          />
        </div>
      )}

      {loading && <div className="text-xs text-ink-2 py-6 text-center">Loading…</div>}

      {!loading && alerts.length === 0 && (
        <div className="text-xs text-ink-2 py-6 text-center border border-dashed border-line rounded-md">
          No active alerts. Fleet is quiet.
        </div>
      )}

      {!loading && alerts.length > 0 && (
        <div className="space-y-1.5">
          {alerts.map(alert => {
            const style = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;
            return (
              <button
                key={alert.id}
                onClick={onAlertClick}
                className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-md hover:bg-surface-2 transition-colors"
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 capitalize ${style.bg} ${style.text}`}
                >
                  {alert.severity}
                </span>
                <span className="text-[10px] text-ink-2 shrink-0">{alert.type}</span>
                <span className="text-xs text-ink-0 truncate flex-1">{alert.message}</span>
                {alert.vehicle_name && (
                  <span className="text-[10px] text-accent-cyan shrink-0">
                    {alert.vehicle_name}
                  </span>
                )}
                <span className="text-[10px] text-ink-2 shrink-0">
                  {alert.triggered_at ? new Date(alert.triggered_at).toLocaleTimeString() : ''}
                </span>
                <span className="text-[10px] text-ink-2 shrink-0 capitalize">{alert.state}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ===========================================================
   TRENDS CHARTS
=========================================================== */
function baseChartOptions(colors, { percent = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: colors.surface,
        titleColor: colors.text,
        bodyColor: colors.text,
        borderColor: colors.line,
        borderWidth: 1,
        padding: 8,
        cornerRadius: 6,
        displayColors: false,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: colors.muted, font: { size: 10 }, maxRotation: 0 },
      },
      y: {
        grid: { color: colors.grid },
        ticks: {
          color: colors.muted,
          font: { size: 10 },
          callback: v => (percent ? `${v}%` : v),
        },
      },
    },
  };
}

function ChartCard({ title, latest, children }) {
  return (
    <div className="bg-surface-2 border border-line-soft rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-ink-2">{title}</span>
        {latest !== undefined && <span className="text-xs font-semibold text-ink-0">{latest}</span>}
      </div>
      <div style={{ height: 130 }}>{children}</div>
    </div>
  );
}

function TrendsCharts({ trends, interval, colors }) {
  const labels = (trends.utilisation || trends.distance || trends.fuel || trends.trips || []).map(
    d => formatDateLabel(d.date, interval)
  );

  const utilisationRates = (trends.utilisation || []).map(d => d.rate);
  const utilisationHours = (trends.utilisation || []).map(d => d.hours);
  const distanceKm = (trends.distance || []).map(d => d.km);
  const fuelLiters = (trends.fuel || []).map(d => d.liters);
  const fuelCost = (trends.fuel || []).map(d => d.cost);
  const tripsCompleted = (trends.trips || []).map(d => d.completed);
  const tripsCancelled = (trends.trips || []).map(d => d.cancelled);
  const tripsTotal = (trends.trips || []).map(d => d.total);

  const lineDataset = (data, color) => ({
    labels,
    datasets: [
      {
        data,
        borderColor: color,
        backgroundColor: `${color}22`,
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        borderWidth: 2,
      },
    ],
  });

  const barDataset = (data, color) => ({
    labels,
    datasets: [
      {
        data,
        backgroundColor: color,
        borderRadius: 4,
        maxBarThickness: 18,
      },
    ],
  });

  const last = arr => (arr.length ? arr[arr.length - 1] : null);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      <ChartCard
        title="Utilisation Rate"
        latest={last(utilisationRates) != null ? `${fmtNumber(last(utilisationRates), 1)}%` : '—'}
      >
        <Line
          data={lineDataset(utilisationRates, colors.cyan)}
          options={{
            ...baseChartOptions(colors, { percent: true }),
            plugins: {
              ...baseChartOptions(colors).plugins,
              tooltip: {
                ...baseChartOptions(colors).plugins.tooltip,
                callbacks: {
                  label: ctx =>
                    `${fmtNumber(ctx.parsed.y, 1)}% · ${fmtNumber(utilisationHours[ctx.dataIndex], 1)}h driving`,
                },
              },
            },
          }}
        />
      </ChartCard>

      <ChartCard
        title="Distance (km)"
        latest={last(distanceKm) != null ? fmtNumber(last(distanceKm)) : '—'}
      >
        <Bar data={barDataset(distanceKm, colors.cyan)} options={baseChartOptions(colors)} />
      </ChartCard>

      <ChartCard
        title="Fuel Used (L)"
        latest={last(fuelLiters) != null ? fmtNumber(last(fuelLiters), 1) : '—'}
      >
        <Line data={lineDataset(fuelLiters, colors.cyan)} options={baseChartOptions(colors)} />
      </ChartCard>

      <ChartCard
        title={`Fuel Cost (${getFleetCurrency()})`}
        latest={last(fuelCost) != null ? fmtNumber(last(fuelCost)) : '—'}
      >
        <Line data={lineDataset(fuelCost, colors.cyan)} options={baseChartOptions(colors)} />
      </ChartCard>

      <ChartCard title="Trips — Completed vs Cancelled">
        <Bar
          data={{
            labels,
            datasets: [
              {
                label: 'Completed',
                data: tripsCompleted,
                backgroundColor: colors.green,
                borderRadius: 4,
                maxBarThickness: 12,
              },
              {
                label: 'Cancelled',
                data: tripsCancelled,
                backgroundColor: colors.danger,
                borderRadius: 4,
                maxBarThickness: 12,
              },
            ],
          }}
          options={{
            ...baseChartOptions(colors),
            plugins: {
              ...baseChartOptions(colors).plugins,
              legend: {
                display: true,
                position: 'bottom',
                labels: { color: colors.text, font: { size: 10 }, boxWidth: 8, boxHeight: 8 },
              },
              tooltip: {
                ...baseChartOptions(colors).plugins.tooltip,
                callbacks: {
                  afterBody: items => `Total trips: ${fmtNumber(tripsTotal[items[0]?.dataIndex])}`,
                },
              },
            },
          }}
        />
      </ChartCard>
    </div>
  );
}

/* ===========================================================
   VEHICLE PERFORMANCE TABLE
=========================================================== */
const VEHICLE_COLUMNS = [
  { field: 'vehicle_name', label: 'Vehicle', sortable: false },
  { field: 'distance_km', label: 'Distance (km)', sortable: true },
  { field: 'driving_hours', label: 'Driving (h)', sortable: true },
  { field: 'idle_hours', label: 'Idle (h)', sortable: true },
  { field: 'utilisation_rate', label: 'Utilisation', sortable: true },
  { field: 'trip_count', label: 'Trips', sortable: false },
  { field: 'fuel_used_liters', label: 'Fuel (L)', sortable: true },
  { field: 'fuel_efficiency', label: 'km/L', sortable: false },
  { field: 'fuel_cost', label: 'Fuel Cost', sortable: false },
];

function utilisationColor(rate) {
  if (rate == null) return 'text-ink-2';
  if (rate < 40) return 'text-danger';
  if (rate < 70) return 'text-warning';
  return 'text-accent-green';
}

function VehiclePerformanceTable({ loading, vehicles, sort, onSort }) {
  return (
    <div className="bg-surface-1 border border-line-soft rounded-md p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-ink-0">Vehicle Performance</span>
        <span className="text-[11px] text-ink-2">
          {loading ? '' : `${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {loading && <div className="text-xs text-ink-2 py-8 text-center">Loading…</div>}

      {!loading && vehicles.length === 0 && (
        <div className="text-xs text-ink-2 py-8 text-center border border-dashed border-line rounded-md">
          No vehicle activity in this date range.
        </div>
      )}

      {!loading && vehicles.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-line-soft">
                {VEHICLE_COLUMNS.map(col => (
                  <th
                    key={col.field}
                    onClick={() => col.sortable && onSort(col.field)}
                    className={`text-[10px] uppercase tracking-wider text-ink-2 font-medium px-2.5 py-2 whitespace-nowrap ${
                      col.sortable ? 'cursor-pointer hover:text-ink-0' : ''
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      {col.sortable &&
                        sort.field === col.field &&
                        (sort.direction === 'asc' ? (
                          <ArrowUp size={10} />
                        ) : (
                          <ArrowDown size={10} />
                        ))}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vehicles.map(v => (
                <tr
                  key={v.vehicle_id}
                  className="border-b border-line-soft last:border-0 hover:bg-surface-2"
                >
                  <td className="px-2.5 py-2 text-xs text-ink-0">
                    {v.vehicle_name}
                    {v.plate && <span className="text-ink-2 ml-1.5">({v.plate})</span>}
                  </td>
                  <td className="px-2.5 py-2 text-xs text-ink-1">{fmtNumber(v.distance_km, 1)}</td>
                  <td className="px-2.5 py-2 text-xs text-ink-1">
                    {fmtNumber(v.driving_hours, 1)}
                  </td>
                  <td className="px-2.5 py-2 text-xs text-ink-1">{fmtNumber(v.idle_hours, 1)}</td>
                  <td
                    className={`px-2.5 py-2 text-xs font-medium ${utilisationColor(v.utilisation_rate)}`}
                  >
                    {v.utilisation_rate != null ? `${fmtNumber(v.utilisation_rate, 1)}%` : '—'}
                  </td>
                  <td className="px-2.5 py-2 text-xs text-ink-1">{fmtNumber(v.trip_count)}</td>
                  <td className="px-2.5 py-2 text-xs text-ink-1">
                    {fmtNumber(v.fuel_used_liters, 1)}
                  </td>
                  <td className="px-2.5 py-2 text-xs text-ink-1">
                    {v.fuel_efficiency != null ? fmtNumber(v.fuel_efficiency, 2) : '—'}
                  </td>
                  <td className="px-2.5 py-2 text-xs text-ink-1">{fmtCurrency(v.fuel_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ===========================================================
   FINANCIAL BREAKDOWN
=========================================================== */
const COST_SLICE_COLORS = {
  fuel: '#29d3ff',
  maintenance: '#a78bfa',
  driver: '#17d68c',
  tolls: '#f5a623',
  other: '#8b95a1',
};

function FinancialSection({ loading, financial, colors }) {
  const breakdown = financial?.cost_breakdown || {};
  const slices = Object.entries(breakdown)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => ({
      name: k.charAt(0).toUpperCase() + k.slice(1),
      value: v,
      color: COST_SLICE_COLORS[k] || colors.cyan,
    }));

  return (
    <div className="bg-surface-1 border border-line-soft rounded-md p-4">
      <div className="flex items-center gap-2 mb-3">
        <Wallet size={14} className="text-accent-cyan" />
        <span className="text-xs font-semibold text-ink-0">Financial Breakdown</span>
      </div>

      {loading && <div className="text-xs text-ink-2 py-8 text-center">Loading…</div>}

      {!loading && financial && (
        <div className="flex flex-col lg:flex-row gap-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 flex-1">
            <FinancialTile
              label="Revenue"
              value={financial.revenue}
              comingSoon={financial.revenue == null}
            />
            <FinancialTile label="Total Cost" value={financial.total_cost} />
            <FinancialTile
              label="Profit"
              value={financial.profit}
              comingSoon={financial.profit == null}
            />
            <FinancialTile
              label="Margin"
              value={financial.margin}
              isPercent
              comingSoon={financial.margin == null}
            />
            <FinancialTile
              label="Outstanding"
              value={financial.outstanding}
              comingSoon={financial.outstanding == null}
            />
            <FinancialTile
              label="Overdue"
              value={financial.overdue}
              comingSoon={financial.overdue == null}
            />
          </div>

          {slices.length > 0 && (
            <div className="flex flex-col items-center shrink-0 w-full lg:w-[220px]">
              <span className="text-[10px] uppercase tracking-wider text-ink-2 mb-2 self-start">
                Cost Breakdown
              </span>
              <DonutChart
                chartData={slices}
                total={fmtNumber(financial.total_cost)}
                label={`${getFleetCurrency()} total`}
                size={140}
                showLegend={false}
                valueFontSize="10px"
                valueFontColor={colors.ink0}
              />
              {/* NeonPieChart's built-in legend is hardcoded white text —
                  fine on its usual dark WebGL overlay panels, unreadable
                  on this card in light mode — so render our own instead. */}
              <div className="flex flex-col gap-1 mt-3 w-full">
                {slices.map(s => (
                  <div key={s.name} className="flex items-center gap-2 text-[11px]">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="text-ink-1 flex-1">{s.name}</span>
                    <span className="text-ink-0 font-medium">{fmtCurrency(s.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FinancialTile({ label, value, comingSoon, isPercent }) {
  return (
    <div className="bg-surface-2 border border-line-soft rounded-md px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-ink-2">{label}</div>
      {comingSoon ? (
        <div className="text-[11px] text-ink-2 mt-1 italic">Coming soon</div>
      ) : (
        <div className="text-sm font-semibold text-ink-0 mt-1 font-display">
          {isPercent ? `${fmtNumber(value, 1)}%` : fmtCurrency(value)}
        </div>
      )}
    </div>
  );
}
