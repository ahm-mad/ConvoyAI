'use client';

import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import {
  Search,
  Sparkles,
  Truck,
  Users,
  Route,
  Warehouse,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { useModal } from '@contexts/ModalContext';
import VehicleDetailModal from '@components/VehicleDetailModal';
import DriverDetailModal from '@components/DriverDetailModal';
import TripDetailModal from '@components/TripDetailModal';
import { useEntitySearch, type EntityKind } from './useEntitySearch';
import { useUser } from '@contexts/UserContext';
import { buildNav, flattenNav } from './nav-config';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAsk: (q: string) => void;
}

const KIND_META: Record<EntityKind, { label: string; icon: typeof Truck }> = {
  vehicle: { label: 'Vehicles', icon: Truck },
  driver: { label: 'Drivers', icon: Users },
  trip: { label: 'Trips', icon: Route },
  yard: { label: 'Yards', icon: Warehouse },
  geofence: { label: 'Geofences', icon: ShieldCheck },
};
const KIND_ORDER: EntityKind[] = ['vehicle', 'driver', 'trip', 'yard', 'geofence'];

const SUGGESTIONS = [
  'Which vehicles will cost the most in fuel this week?',
  'Who is at risk of an hours-of-service breach?',
  'Predict maintenance for next month',
];

/** ⌘K / Ctrl+K command palette: jump to any screen or hand a question to the AI copilot. */
export default function CommandPalette({ open, onOpenChange, onAsk }: Props) {
  const router = useRouter();
  const { openModal } = useModal();
  const [term, setTerm] = useState('');
  const entities = useEntitySearch(term, open);
  const { user, isSuperAdmin, hasPermission } = useUser();
  const leaves = flattenNav(buildNav({ isSuperAdmin, isDemo: user?.isDemo, hasPermission }));
  const groups = Array.from(new Set(leaves.map(l => l.group)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      } else if (open && e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) setTerm('');
  }, [open]);

  const openEntity = (kind: EntityKind, id: number | string, title: string) => {
    onOpenChange(false);

    if (kind === 'vehicle') return openModal(<VehicleDetailModal vehicleId={id} />);
    if (kind === 'driver') return openModal(<DriverDetailModal driverId={id} />);
    if (kind === 'trip') return openModal(<TripDetailModal tripId={id} onListChanged={() => {}} />);

    // Yards / geofences have no standalone detail: open the list with the record searched.
    const list = kind === 'yard' ? 'yards' : 'geofences';

    try {
      sessionStorage.setItem(`list:${list}:server`, JSON.stringify({ search: title, page: 1 }));
    } catch {
      /* not persisted: the list just opens unfiltered */
    }
    router.push(`/fleet-management/operations/${list}`);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-ink-0/30 px-4 pt-[14vh] backdrop-blur-sm"
      onMouseDown={e => e.target === e.currentTarget && onOpenChange(false)}
    >
      <Command
        label="Command palette"
        className="glass-menu w-full max-w-[640px] overflow-hidden rounded-modal"
        style={{ boxShadow: 'var(--shadow-modal)' }}
      >
        <div className="flex items-center gap-3 border-b border-line-soft px-5 py-4">
          <Search size={18} className="text-ink-2" />
          <Command.Input
            autoFocus
            placeholder="Search screens and records, or ask Convoy anything…"
            value={term}
            onValueChange={setTerm}
            className="w-full bg-transparent text-[15px] text-ink-0 outline-none placeholder:text-ink-2"
          />
          {entities.loading && <Loader2 size={16} className="animate-spin text-ink-2" />}
          <kbd className="rounded-md border border-line bg-white px-1.5 py-px font-mono text-[11px] text-ink-1">
            esc
          </kbd>
        </div>
        <Command.List className="max-h-[52vh] overflow-y-auto p-2.5">
          {entities.hits.length === 0 && (
            <Command.Empty className="px-4 py-8 text-center text-sm text-ink-2">
              {entities.loading ? 'Searching records…' : 'No matching screens or records.'}
            </Command.Empty>
          )}

          {entities.query.length >= 2 &&
            KIND_ORDER.map(kind => {
              const rows = entities.hits.filter(h => h.kind === kind);

              if (rows.length === 0) return null;

              const { label, icon: Icon } = KIND_META[kind];

              return (
                <Command.Group
                  key={kind}
                  forceMount
                  heading={label}
                  className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-ink-2"
                >
                  {rows.map(h => (
                    <Command.Item
                      key={`${kind}-${h.id}`}
                      forceMount
                      value={`record ${kind} ${h.id} ${h.title}`}
                      onSelect={() => openEntity(kind, h.id, h.title)}
                      className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-[13.5px] text-ink-0 data-[selected=true]:bg-brand-wash/70"
                    >
                      <span className="grid size-8 place-items-center rounded-xl bg-brand-wash text-brand icon-gradient">
                        <Icon size={16} />
                      </span>
                      <span className="font-medium">{h.title}</span>
                      {h.sub && (
                        <span className="ml-auto max-w-[45%] truncate text-xs text-ink-2">
                          {h.sub}
                        </span>
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              );
            })}

          <Command.Group
            heading="Ask Convoy AI"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-ink-2"
          >
            {SUGGESTIONS.map(q => (
              <Command.Item
                key={q}
                value={`ask ${q}`}
                onSelect={() => {
                  onOpenChange(false);
                  onAsk(q);
                }}
                className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-[13.5px] text-ink-0 data-[selected=true]:bg-ai-wash"
              >
                <span className="btn-ai grid size-8 place-items-center rounded-xl">
                  <Sparkles size={15} fill="currentColor" />
                </span>
                {q}
              </Command.Item>
            ))}
          </Command.Group>

          {groups.map(group => (
            <Command.Group
              key={group}
              heading={group}
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-ink-2"
            >
              {leaves
                .filter(l => l.group === group)
                .map(l => {
                  const Icon = l.icon;
                  return (
                    <Command.Item
                      key={l.href}
                      value={`${group} ${l.label} ${l.hint ?? ''}`}
                      onSelect={() => {
                        onOpenChange(false);
                        router.push(l.href);
                      }}
                      className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-[13.5px] text-ink-0 data-[selected=true]:bg-brand-wash/70"
                    >
                      <span className="grid size-8 place-items-center rounded-xl bg-brand-wash text-brand icon-gradient">
                        <Icon size={16} />
                      </span>
                      <span className="font-medium">{l.label}</span>
                      {l.hint && (
                        <span className="ml-auto truncate text-xs text-ink-2">{l.hint}</span>
                      )}
                    </Command.Item>
                  );
                })}
            </Command.Group>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}
