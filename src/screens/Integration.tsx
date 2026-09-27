'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  ArrowUpRight,
  Bell,
  Cpu,
  Fuel,
  IdCard,
  Mail,
  MapPinned,
  MessageSquare,
  Radio,
  Route,
  Search,
  Satellite,
  Server,
  Signal,
  Webhook,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

type Status = 'available' | 'active' | 'preview';

interface Connector {
  key: string;
  name: string;
  category: string;
  description: string;
  icon: LucideIcon;
  status: Status;
  /** Where "Configure" goes for connectors that exist today. */
  href?: string;
}

const CONNECTORS: Connector[] = [
  {
    key: 'https',
    name: 'HTTPS webhook',
    category: 'Telemetry',
    description: 'Push device packets to a per-product webhook URL with a signed token.',
    icon: Webhook,
    status: 'available',
    href: '/manage-product',
  },
  {
    key: 'mqtt',
    name: 'MQTT broker',
    category: 'Telemetry',
    description: 'Publish readings over MQTT with per-product credentials and topics.',
    icon: Server,
    status: 'available',
    href: '/manage-product',
  },
  {
    key: 'lorawan',
    name: 'LoRaWAN',
    category: 'Telemetry',
    description: 'Choose from 16 LoRaWAN network servers and map uplinks to your devices.',
    icon: Radio,
    status: 'preview',
  },
  {
    key: 'particle',
    name: 'Particle',
    category: 'Telemetry',
    description: 'Connect Particle cellular trackers and stream their events as readings.',
    icon: Cpu,
    status: 'preview',
  },
  {
    key: 'teltonika',
    name: 'Teltonika GPS',
    category: 'Telemetry',
    description: 'Ingest Teltonika FMB/FMC tracker positions, ignition and CAN data.',
    icon: Satellite,
    status: 'preview',
  },
  {
    key: 'sigfox',
    name: 'Sigfox',
    category: 'Telemetry',
    description: 'Low-power asset beacons over Sigfox with callback mapping.',
    icon: Signal,
    status: 'preview',
  },
  {
    key: 'fuelcards',
    name: 'Fuel cards',
    category: 'Fleet data',
    description: 'Import card transactions and reconcile them with logged fill-ups.',
    icon: Fuel,
    status: 'preview',
  },
  {
    key: 'erp',
    name: 'Maintenance & ERP',
    category: 'Fleet data',
    description: 'Sync work orders and parts with your ERP or maintenance system.',
    icon: Wrench,
    status: 'preview',
  },
  {
    key: 'driverid',
    name: 'Driver ID & tachograph',
    category: 'Fleet data',
    description: 'RFID / iButton driver login and tachograph hours of service.',
    icon: IdCard,
    status: 'preview',
  },
  {
    key: 'email',
    name: 'Email alerts',
    category: 'Notifications',
    description: 'Send digests and critical alerts to individuals or distribution lists.',
    icon: Mail,
    status: 'preview',
  },
  {
    key: 'slack',
    name: 'Team chat',
    category: 'Notifications',
    description: 'Post incidents, geofence events and AI insights to a channel.',
    icon: MessageSquare,
    status: 'preview',
  },
  {
    key: 'push',
    name: 'Mobile push',
    category: 'Notifications',
    description: 'Push notifications for drivers and dispatchers on the ConvoyAI app.',
    icon: Bell,
    status: 'preview',
  },
  {
    key: 'maptiler',
    name: 'MapTiler basemaps',
    category: 'Maps & routing',
    description: 'Vector-quality basemaps behind the live map, yards and geofences.',
    icon: MapPinned,
    status: 'active',
  },
  {
    key: 'routing',
    name: 'Routing & live traffic',
    category: 'Maps & routing',
    description: 'Road-network routing, ETA prediction and closure-aware rerouting.',
    icon: Route,
    status: 'preview',
  },
];

const CATEGORIES = ['All', ...Array.from(new Set(CONNECTORS.map(c => c.category)))];

const STATUS_LABEL: Record<Status, string> = {
  available: 'Available',
  active: 'Connected',
  preview: 'Preview',
};

const STATUS_CLASS: Record<Status, string> = {
  available: 'bg-brand-wash text-brand-ink',
  active: 'bg-success/15 text-success',
  preview: 'bg-ai-wash text-ai',
};

export default function Integration() {
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [requested, setRequested] = useState<Record<string, boolean>>({});

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();

    return CONNECTORS.filter(
      c =>
        (category === 'All' || c.category === category) &&
        (!q || `${c.name} ${c.description} ${c.category}`.toLowerCase().includes(q))
    );
  }, [category, search]);

  const live = CONNECTORS.filter(c => c.status !== 'preview').length;

  return (
    <div className="p-1 sm:p-4">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Connect</div>
          <h1 className="page-title mt-1">Integrations</h1>
          <p className="page-subtitle mt-1 max-w-xl">
            Bring telemetry, fleet data and alerts into ConvoyAI. {live} of {CONNECTORS.length}{' '}
            connectors are live today; the rest are on the roadmap.
          </p>
        </div>
        <label className="control flex w-full items-center gap-2 px-3 py-2 sm:w-72">
          <Search size={15} className="text-ink-2" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search integrations…"
            className="w-full bg-transparent text-sm text-ink-0 outline-none placeholder:text-ink-2"
          />
        </label>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5" role="tablist" aria-label="Integration category">
        {CATEGORIES.map(c => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={category === c}
            onClick={() => setCategory(c)}
            className={`tab whitespace-nowrap ${category === c ? 'tab-active' : ''}`}
          >
            {c}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="glass px-6 py-14 text-center text-sm text-ink-2">
          No integrations match “{search}”.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map(c => {
            const Icon = c.icon;

            return (
              <div key={c.key} className="glass group card-lift spotlight flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-11 place-items-center rounded-card bg-brand-wash text-brand icon-gradient">
                    <Icon size={20} />
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_CLASS[c.status]}`}
                  >
                    {STATUS_LABEL[c.status]}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="card-title">{c.name}</div>
                  <div className="eyebrow mt-0.5">{c.category}</div>
                  <p className="mt-2 text-sm text-ink-1">{c.description}</p>
                </div>
                {c.href ? (
                  <Link
                    href={c.href}
                    className="btn-brand inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium"
                  >
                    Configure per product <ArrowUpRight size={14} />
                  </Link>
                ) : c.status === 'active' ? (
                  <span className="text-xs text-ink-2">
                    Managed by ConvoyAI — nothing to set up.
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={requested[c.key]}
                    onClick={() => {
                      setRequested(r => ({ ...r, [c.key]: true }));
                      toast.success(`We'll let you know when ${c.name} is ready.`);
                    }}
                    className="btn-soft inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-medium disabled:opacity-60"
                  >
                    {requested[c.key] ? 'Requested ✓' : 'Notify me'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
