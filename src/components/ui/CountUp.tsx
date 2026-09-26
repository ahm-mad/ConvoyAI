'use client';

import NumberFlow from '@number-flow/react';

/**
 * Odometer number: every digit rolls to its new value (on mount from 0, and on every change). Takes the already
 * formatted string ("87.4", "1,204", "PKR 9.3M", "82.1K km") and keeps its prefix / suffix / decimals / grouping;
 * anything that is not a plain number ("—", "12 h 05 min") renders untouched. Honours prefers-reduced-motion.
 */
export default function CountUp({ value }: { value: string; duration?: number }) {
  const m = /^([^\d]*?)(\d[\d,]*\.?\d*)([^\d]*)$/.exec(value.trim());

  if (!m) return <span className="tabular-nums">{value}</span>;

  const [, prefix, raw, suffix] = m;
  const n = parseFloat(raw.replace(/,/g, ''));
  const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;

  if (!Number.isFinite(n)) return <span className="tabular-nums">{value}</span>;

  return (
    <NumberFlow
      value={n}
      prefix={prefix}
      suffix={suffix}
      locales="en-US"
      format={{
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping: raw.includes(','),
      }}
      className="tabular-nums"
      transformTiming={{ duration: 900, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}
      spinTiming={{ duration: 900, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}
    />
  );
}
