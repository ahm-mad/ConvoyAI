import { useState, type ComponentType } from 'react';
import {
  LayoutDashboard,
  Map as MapIcon,
  Truck,
  Users,
  ShieldAlert,
  Warehouse,
  Route,
  History,
  TriangleAlert,
} from 'lucide-react';
import FleetDashboard from '@pages/FleetDashboard';
import FleetMap from '@pages/FleetMap';
import Vehicles from '@pages/Vehicles';
import Drivers from '@pages/Drivers';
import Geofences from '@pages/Geofences';
import Yards from '@pages/Yards';
import Trips from '@pages/Trips';
import Assignments from '@pages/Assignments';
import Incidents from '@pages/Incidents';
import { useFleetRealtime } from '@hooks/useFleetRealtime';

/**
 * Consolidates every Fleet Management sub-area under one sidebar entry
 * point, instead of five separate top-level nav items. Deliberately
 * reuses each existing page component unchanged (FleetMap, Vehicles,
 * Drivers, Geofences, Yards) rather than rewriting their internals —
 * every one of them was already built, tested, and verified on its own;
 * this just changes how they're reached, not what they do.
 */
interface FleetTab {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number | string }>;
}

export default function FleetManagement() {
  const [tab, setTab] = useState('dashboard');

  // Live positions / trip / geofence updates from the company room (flows/05 step 6).
  useFleetRealtime();

  const tabs: FleetTab[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'map', label: 'Map', icon: MapIcon },
    { id: 'vehicles', label: 'Vehicles', icon: Truck },
    { id: 'drivers', label: 'Drivers', icon: Users },
    { id: 'geofences', label: 'Geofences', icon: ShieldAlert },
    { id: 'yards', label: 'Yards', icon: Warehouse },
    { id: 'trips', label: 'Trips', icon: Route },
    { id: 'assignments', label: 'Assignments', icon: History },
    { id: 'incidents', label: 'Incidents', icon: TriangleAlert },
  ];

  return (
    <div className="flex flex-col h-full">
      <div
        role="tablist"
        className="flex gap-1 px-4 pt-2.5 border-b border-line-soft bg-surface-1 shrink-0"
      >
        {tabs.map(t => {
          const Icon = t.icon;

          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 border-b-2 -mb-px ${
                tab === t.id
                  ? 'text-ink-0 border-accent-cyan'
                  : 'text-ink-2 border-transparent hover:text-ink-1'
              }`}
            >
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-hidden">
        {/* Each tab's content stays mounted only while active — matches
            how every other tabbed view in this app already behaves
            (VehicleDetailModal, DriverDetailModal), rather than keeping
            five pages' worth of queries running simultaneously. */}
        {tab === 'dashboard' && <FleetDashboard onNavigateTab={setTab} />}
        {tab === 'map' && <FleetMap />}
        {tab === 'vehicles' && (
          <div className="h-full overflow-y-auto">
            <Vehicles />
          </div>
        )}
        {tab === 'drivers' && (
          <div className="h-full overflow-y-auto">
            <Drivers />
          </div>
        )}
        {tab === 'geofences' && (
          <div className="h-full overflow-y-auto">
            <Geofences />
          </div>
        )}
        {tab === 'yards' && (
          <div className="h-full overflow-y-auto">
            <Yards />
          </div>
        )}
        {tab === 'trips' && (
          <div className="h-full overflow-y-auto">
            <Trips />
          </div>
        )}
        {tab === 'assignments' && (
          <div className="h-full overflow-y-auto">
            <Assignments />
          </div>
        )}
        {tab === 'incidents' && (
          <div className="h-full overflow-y-auto">
            <Incidents />
          </div>
        )}
      </div>
    </div>
  );
}
