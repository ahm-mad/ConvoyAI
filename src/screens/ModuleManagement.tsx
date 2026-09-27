'use client';

import {
  Bell,
  Boxes,
  Building2,
  LayoutDashboard,
  Plug,
  ShieldCheck,
  Truck,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { useSimpleQuery } from '@hooks/useSimpleQuery';

interface ModuleMeta {
  name: string;
  description: string;
  icon: LucideIcon;
  core?: boolean;
}

/** Friendly copy for the module codes the API returns (unknown codes fall back to their code). */
const META: Record<string, ModuleMeta> = {
  fleet: {
    name: 'Fleet management',
    description: 'Vehicles, drivers, trips, yards, geofences, incidents and fleet analytics.',
    icon: Truck,
    core: true,
  },
  product: {
    name: 'Products & devices',
    description: 'Product templates, device registry, packets and connector health.',
    icon: Boxes,
    core: true,
  },
  'role-permission': {
    name: 'Roles & permissions',
    description: 'Role-based access control, members and per-module permissions.',
    icon: ShieldCheck,
    core: true,
  },
  dashboard: {
    name: 'Dashboards',
    description: 'Company-wide overview and customisable widgets.',
    icon: LayoutDashboard,
  },
  connect: {
    name: 'Connect',
    description: 'Integrations, webhooks and data connectors.',
    icon: Plug,
  },
  building: {
    name: 'Buildings & sites',
    description: 'Digital-twin floors, sensor maps and site layouts.',
    icon: Building2,
  },
  alarms: {
    name: 'Alarms',
    description: 'Alarm inbox, acknowledgement and escalation.',
    icon: Bell,
  },
  'rule-builder': {
    name: 'Rule builder',
    description: 'No-code rules that turn readings into alerts and actions.',
    icon: Workflow,
  },
};

export default function ModuleManagement() {
  const q = useSimpleQuery<any>('platform-modules', '/api/modules', {}, { staleTime: 300_000 });
  const modules: { id: number; code: string; slug: string }[] = q.data?.modules ?? [];

  return (
    <div className="p-1 sm:p-4">
      <div className="mb-6">
        <div className="eyebrow">Platform</div>
        <h1 className="page-title mt-1">Modules</h1>
        <p className="page-subtitle mt-1 max-w-xl">
          The building blocks of the platform. Roles grant access to modules; enabling or disabling
          a module for a whole company is managed by the platform team.
        </p>
      </div>

      {q.isLoading ? (
        <div className="glass px-6 py-14 text-center text-sm text-ink-2">Loading modules…</div>
      ) : modules.length === 0 ? (
        <div className="glass px-6 py-14 text-center text-sm text-ink-2">
          No modules were returned by the platform.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map(m => {
            const meta = META[m.code];
            const Icon = meta?.icon ?? Boxes;

            return (
              <div key={m.id} className="glass group card-lift spotlight flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-11 place-items-center rounded-card bg-brand-wash text-brand icon-gradient">
                    <Icon size={20} />
                  </span>
                  <span className="rounded-full bg-brand-wash px-2.5 py-1 text-[11px] font-medium text-brand-ink">
                    Available
                  </span>
                </div>
                <div>
                  <div className="card-title">{meta?.name ?? m.code}</div>
                  <div className="eyebrow mt-0.5">
                    {meta?.core ? 'Core module' : 'Optional module'} · {m.slug}
                  </div>
                </div>
                <p className="text-sm text-ink-1">{meta?.description ?? 'Platform module.'}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
