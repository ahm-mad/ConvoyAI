'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  Route as RouteIcon,
  Sparkles,
  Wrench,
} from 'lucide-react';

type Kind = 'alert' | 'maintenance' | 'trip' | 'ai';

interface Item {
  id: number;
  kind: Kind;
  title: string;
  text: string;
  when: string;
}

const KIND_META: Record<Kind, { label: string; icon: typeof Bell; tone: string }> = {
  alert: { label: 'Alerts', icon: AlertTriangle, tone: 'bg-danger/10 text-danger-text' },
  maintenance: { label: 'Maintenance', icon: Wrench, tone: 'bg-warning/15 text-warning' },
  trip: { label: 'Trips', icon: RouteIcon, tone: 'bg-brand-wash text-brand icon-gradient' },
  ai: { label: 'AI', icon: Sparkles, tone: 'bg-ai-wash text-ai-ink' },
};

const SEED: Item[] = [
  {
    id: 1,
    kind: 'alert',
    title: 'Harsh braking on KHI-0764',
    text: '3 events in the last hour',
    when: '4 min ago',
  },
  {
    id: 2,
    kind: 'maintenance',
    title: 'Service due in 9 days',
    text: 'LHE-1180 · brake inspection',
    when: '1 h ago',
  },
  {
    id: 3,
    kind: 'trip',
    title: 'Trip T-48213 completed',
    text: 'Delivered 12 min early',
    when: '3 h ago',
  },
  {
    id: 4,
    kind: 'ai',
    title: 'AI found savings this week',
    text: 'Review 3 suggestions',
    when: 'Today',
  },
  {
    id: 5,
    kind: 'alert',
    title: 'Geofence exit: Karachi Port Yard',
    text: 'KHI-2291 left the yard outside working hours',
    when: 'Today',
  },
  {
    id: 6,
    kind: 'maintenance',
    title: 'Insurance expires in 12 days',
    text: 'ISB-4410 · vehicle document',
    when: 'Today',
  },
  {
    id: 7,
    kind: 'trip',
    title: 'Trip T-48190 running late',
    text: 'Predicted 34 min behind plan',
    when: 'Yesterday',
  },
  {
    id: 8,
    kind: 'ai',
    title: 'Driver near hours limit',
    text: '3 drivers will exceed 9 h before their trips end',
    when: 'Yesterday',
  },
  {
    id: 9,
    kind: 'alert',
    title: 'Tracker went silent',
    text: 'LHE-1180 has not reported for 40 minutes',
    when: 'Yesterday',
  },
  {
    id: 10,
    kind: 'trip',
    title: 'Trip T-48177 cancelled',
    text: 'Reason: customer rescheduled',
    when: '2 days ago',
  },
];

export default function Notifications() {
  const [read, setRead] = useState<Record<number, boolean>>({});
  const [filter, setFilter] = useState<'all' | 'unread' | Kind>('all');

  const unreadCount = SEED.filter(n => !read[n.id]).length;
  const shown = useMemo(
    () =>
      SEED.filter(n =>
        filter === 'all' ? true : filter === 'unread' ? !read[n.id] : n.kind === filter
      ),
    [filter, read]
  );

  const tabs: { key: 'all' | 'unread' | Kind; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: `Unread (${unreadCount})` },
    ...(Object.keys(KIND_META) as Kind[]).map(k => ({ key: k, label: KIND_META[k].label })),
  ];

  return (
    <div className="p-1 sm:p-4">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Inbox</div>
          <h1 className="page-title mt-1">Notifications</h1>
          <p className="page-subtitle mt-1">
            Alerts, maintenance reminders, trip events and AI insights.{' '}
            <span className="rounded-full bg-ai-wash px-2 py-0.5 text-[11px] font-medium text-ai">
              Preview data
            </span>
          </p>
        </div>
        <button
          type="button"
          disabled={unreadCount === 0}
          onClick={() => setRead(Object.fromEntries(SEED.map(n => [n.id, true])))}
          className="btn-soft inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium disabled:opacity-50"
        >
          <CheckCheck size={14} /> Mark all read
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter notifications">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={filter === t.key}
            onClick={() => setFilter(t.key)}
            className={`tab whitespace-nowrap ${filter === t.key ? 'tab-active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="glass divide-y divide-line-soft overflow-hidden">
        {shown.length === 0 ? (
          <div className="px-6 py-14 text-center text-sm text-ink-2">
            Nothing here. You are all caught up.
          </div>
        ) : (
          shown.map(n => {
            const meta = KIND_META[n.kind];
            const Icon = meta.icon;
            const isRead = !!read[n.id];

            return (
              <button
                key={n.id}
                type="button"
                onClick={() => setRead(r => ({ ...r, [n.id]: !r[n.id] }))}
                title={isRead ? 'Mark as unread' : 'Mark as read'}
                className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-black/[0.03]"
              >
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-control ${meta.tone}`}
                >
                  <Icon size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm text-ink-0 ${isRead ? 'font-normal' : 'font-semibold'}`}
                  >
                    {n.title}
                  </span>
                  <span className="block text-xs text-ink-2">{n.text}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-ink-2">
                  {n.when}
                  {!isRead && <span className="size-2 rounded-full bg-brand" aria-label="Unread" />}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
