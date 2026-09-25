/** Number / money / duration formatting shared by every analytics widget (locale-aware, units always shown). */
import { formatFleetMoney } from '@utils/fleetCurrency';

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 1,284 · 12.9K · 4.2M — compact for tiles and axes. */
export const compact = (n: number | null | undefined, digits = 1): string => {
  if (!isNum(n)) return '—';

  const abs = Math.abs(n);

  if (abs >= 1e9) return `${(n / 1e9).toFixed(digits).replace(/\.0+$/, '')}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(digits).replace(/\.0+$/, '')}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(digits).replace(/\.0+$/, '')}K`;

  return n.toLocaleString(undefined, { maximumFractionDigits: abs < 100 ? 1 : 0 });
};

export const int = (n: number | null | undefined): string =>
  isNum(n) ? Math.round(n).toLocaleString() : '—';

export const decimal = (n: number | null | undefined, digits = 1): string =>
  isNum(n) ? n.toLocaleString(undefined, { maximumFractionDigits: digits }) : '—';

export const pct = (n: number | null | undefined, digits = 1): string =>
  isNum(n) ? `${n.toLocaleString(undefined, { maximumFractionDigits: digits })}%` : '—';

export const money = (n: number | null | undefined): string => formatFleetMoney(n);

/** Money with the currency code in front and compact large values: USD 1.2M. */
export const moneyCompact = (n: number | null | undefined, code: string): string =>
  isNum(n) ? `${code} ${compact(n, 1)}` : '—';

export const hours = (n: number | null | undefined, digits = 1): string =>
  isNum(n) ? `${decimal(n, digits)} h` : '—';

export const km = (n: number | null | undefined): string =>
  isNum(n) ? `${compact(n, 1)} km` : '—';

/** Change between two values in percent (`null` when it cannot be computed). */
export const deltaPct = (
  current: number | null | undefined,
  previous: number | null | undefined
) => {
  if (!isNum(current) || !isNum(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;

  return ((current - previous) / Math.abs(previous)) * 100;
};

const dateFmt = (o: Intl.DateTimeFormatOptions) => (d: Date) => d.toLocaleDateString(undefined, o);

export const shortDate = dateFmt({ month: 'short', day: 'numeric' });
export const monthYear = dateFmt({ month: 'short', year: '2-digit' });

/** `2026-09-25` (a calendar date in the company timezone) → Date at local midnight, for labels only. */
export const parseYmd = (s: string): Date => new Date(`${s}T00:00:00`);

export const ymd = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');

  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const addDays = (s: string, days: number): string => {
  const d = parseYmd(s);

  d.setDate(d.getDate() + days);

  return ymd(d);
};

/** The same calendar date one year earlier (29 Feb → 28 Feb, like the backend's `previous_year`). */
export const minusYear = (s: string): string => {
  const [y, m, d] = s.split('-').map(Number);
  const day = m === 2 && d === 29 ? 28 : d;

  return `${y - 1}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export const daysBetween = (from: string, to: string): number =>
  Math.round((parseYmd(to).getTime() - parseYmd(from).getTime()) / 86400000) + 1;

/** "Updated 2 min ago" style relative time. */
export const ago = (iso: string | null | undefined, now = Date.now()): string => {
  if (!iso) return '';

  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));

  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;

  return `${Math.floor(s / 86400)} d ago`;
};
