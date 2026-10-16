import { describe, expect, it } from 'vitest';
import { RecordingFleetRealtime } from '../../../platform/realtime/__tests__/recording-fleet-realtime.js';
import { FleetStatusBroadcaster } from '../fleet-status.broadcaster.js';
import type { FleetDashboardRepository } from '../fleet-dashboard.repository.js';
import type { FleetDashboardService } from '../fleet-dashboard.service.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');

function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: (key: string) => Promise.resolve(store.get(key) ?? null),
    set: (key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK' as const);
    },
  };
}

describe('FleetStatusBroadcaster (flow 07 A9)', () => {
  const counts = (over: Record<string, number> = {}) => ({
    total: 5,
    moving: 1,
    idle: 0,
    parked: 1,
    offline: 1,
    no_tracker: 2,
    ...over,
  });

  it('announces the counts of each fleet company on the first run, then stays silent until they change', async () => {
    const realtime = new RecordingFleetRealtime();
    const redis = fakeRedis();
    let current = counts();
    const repo = {
      companyIdsWithVehicles: () => Promise.resolve(['7']),
    } as unknown as FleetDashboardRepository;
    const service = {
      statusCountsForBroadcast: () => Promise.resolve(current),
    } as unknown as FleetDashboardService;
    const broadcaster = new FleetStatusBroadcaster(repo, service, realtime, redis);

    expect(await broadcaster.run(NOW)).toEqual({ companies: 1, published: 1 });
    expect(realtime.statusSummaries).toEqual([
      { companyId: '7', payload: { ...counts(), occurredAt: NOW.toISOString() } },
    ]);

    expect(await broadcaster.run(NOW)).toEqual({ companies: 1, published: 0 }); // nothing changed
    expect(realtime.statusSummaries).toHaveLength(1);

    current = counts({ moving: 0, offline: 2 }); // a tracker went silent — no packet, but the minute job notices
    expect(await broadcaster.run(new Date(NOW.getTime() + 60_000))).toEqual({
      companies: 1,
      published: 1,
    });
    expect(realtime.statusSummaries[1]?.payload).toMatchObject({ moving: 0, offline: 2 });
  });

  it('one company failing never stops the others, and a failed company is retried on the next run', async () => {
    const realtime = new RecordingFleetRealtime();
    const redis = fakeRedis();
    let boom = true;
    const repo = {
      companyIdsWithVehicles: () => Promise.resolve(['1', '2', '3']),
    } as unknown as FleetDashboardRepository;
    const { getRequestContext } = await import('../../../platform/http/request-context.js');
    const service = {
      statusCountsForBroadcast: () => {
        const companyId = getRequestContext()?.companyId;
        if (companyId === '2' && boom) return Promise.reject(new Error('db hiccup'));
        return Promise.resolve(counts({ total: Number(companyId) }));
      },
    } as unknown as FleetDashboardService;
    const broadcaster = new FleetStatusBroadcaster(repo, service, realtime, redis);

    expect(await broadcaster.run(NOW)).toEqual({ companies: 3, published: 2 });
    expect(realtime.statusSummaries.map(s => s.companyId)).toEqual(['1', '3']);
    boom = false;
    expect(await broadcaster.run(NOW)).toEqual({ companies: 3, published: 1 });
    expect(realtime.statusSummaries.map(s => s.companyId)).toEqual(['1', '3', '2']);
  });

  it('runs each company under its OWN request context (so every read is tenant-scoped) and stores the last announcement with a one-day expiry', async () => {
    const realtime = new RecordingFleetRealtime();
    const sets: unknown[][] = [];
    const redis = {
      get: () => Promise.resolve(null),
      set: (...args: unknown[]) => {
        sets.push(args);
        return Promise.resolve('OK' as const);
      },
    };
    const seen: (string | undefined)[] = [];
    const { getRequestContext } = await import('../../../platform/http/request-context.js');
    const repo = {
      companyIdsWithVehicles: () => Promise.resolve(['10', '20']),
    } as unknown as FleetDashboardRepository;
    const service = {
      statusCountsForBroadcast: () => {
        seen.push(getRequestContext()?.companyId);
        return Promise.resolve(counts());
      },
    } as unknown as FleetDashboardService;
    await new FleetStatusBroadcaster(repo, service, realtime, redis).run(NOW);
    expect(seen).toEqual(['10', '20']);
    expect(sets.map(a => [a[0], a[2], a[3]])).toEqual([
      ['fleet:status-summary:last:10', 'EX', 86400],
      ['fleet:status-summary:last:20', 'EX', 86400],
    ]);
  });
});
