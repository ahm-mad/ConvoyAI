'use client';

import { Boxes, Cpu, Radio, Wifi } from 'lucide-react';
import { useSimpleQuery } from '@hooks/useSimpleQuery';

/** Fleet-of-devices at a glance above the products table (GET /api/dashboard/analytics). */
export default function DeviceSummary({ products }: { products?: number }) {
  const q = useSimpleQuery<any>(
    'dashboard-analytics',
    '/api/dashboard/analytics',
    {},
    {
      staleTime: 60_000,
    }
  );
  const d = q.data?.data;
  const total = d?.total_devices;
  const online = d?.online_devices;
  const tiles = [
    { label: 'Products', value: products ?? '—', icon: Boxes, hint: 'Templates in your workspace' },
    { label: 'Devices', value: total ?? '—', icon: Cpu, hint: 'Registered across all products' },
    {
      label: 'Online now',
      value: online ?? '—',
      icon: Wifi,
      hint: total
        ? `${Math.round(((online ?? 0) / total) * 100)}% of devices reporting`
        : 'Reporting right now',
    },
    {
      label: 'Active in 24 h',
      value: d?.active_in_last_24h ?? '—',
      icon: Radio,
      hint: 'Reported within the last day',
    },
  ];

  return (
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map(t => (
        <div key={t.label} className="glass card-lift flex items-start gap-3 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-brand-wash text-brand icon-gradient">
            <t.icon size={18} />
          </span>
          <div className="min-w-0">
            <div className="eyebrow">{t.label}</div>
            <div className="kpi-value">{t.value}</div>
            <div className="truncate text-caption text-ink-2">{t.hint}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
