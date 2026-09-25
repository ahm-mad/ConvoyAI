'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import FleetNav from '@components/fleet/FleetNav';
import TimezoneNotice from '@components/fleet/TimezoneNotice';
import { useFleetRealtime } from '@hooks/useFleetRealtime';

/**
 * Shell of every Fleet Management page: the two-level navigation on top, the page below, and the
 * fleet realtime rules mounted ONCE for all of them (positions, trips, geofences, status summary).
 * The pre-restructure hub is kept unchanged at /fleet-management/legacy (own tab bar, own realtime).
 */
export default function FleetLayout({ children }: { children: ReactNode }) {
  const legacy = (usePathname() ?? '').startsWith('/fleet-management/legacy');

  return legacy ? <>{children}</> : <FleetShell>{children}</FleetShell>;
}

function FleetShell({ children }: { children: ReactNode }) {
  useFleetRealtime();

  return (
    <div className="flex flex-col h-full">
      <FleetNav />
      <TimezoneNotice />
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
