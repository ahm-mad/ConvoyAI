/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { get } from '@utils/apiHelper';

export type EntityKind = 'vehicle' | 'driver' | 'trip' | 'yard' | 'geofence';

export interface EntityHit {
  kind: EntityKind;
  id: number | string;
  title: string;
  sub?: string;
}

const SOURCES: { kind: EntityKind; url: string; map: (x: any) => EntityHit }[] = [
  {
    kind: 'vehicle',
    url: '/api/vehicles',
    map: v => ({
      kind: 'vehicle',
      id: v.id,
      title: v.name,
      sub: [v.plate, v.vehicle_category].filter(Boolean).join(' · '),
    }),
  },
  {
    kind: 'driver',
    url: '/api/drivers',
    map: d => ({
      kind: 'driver',
      id: d.id,
      title: [d.first_name, d.last_name].filter(Boolean).join(' '),
      sub: d.license_number || d.status,
    }),
  },
  {
    kind: 'trip',
    url: '/api/trips',
    map: t => ({
      kind: 'trip',
      id: t.id,
      title: t.trip_reference || `Trip #${t.id}`,
      sub: [t.origin_address, t.destination_address].filter(Boolean).join(' → '),
    }),
  },
  {
    kind: 'yard',
    url: '/api/yards',
    map: y => ({ kind: 'yard', id: y.id, title: y.name, sub: y.address || undefined }),
  },
  {
    kind: 'geofence',
    url: '/api/geofences',
    map: g => ({ kind: 'geofence', id: g.id, title: g.name, sub: g.yard?.name || undefined }),
  },
];

/** Debounced search across the fleet's records for the ⌘K palette (5 hits per kind, best effort). */
export function useEntitySearch(term: string, enabled: boolean) {
  const [hits, setHits] = useState<EntityHit[]>([]);
  const [loading, setLoading] = useState(false);
  const q = term.trim();

  useEffect(() => {
    if (!enabled || q.length < 2) {
      setHits([]);
      setLoading(false);

      return;
    }

    let stale = false;

    setLoading(true);

    const timer = setTimeout(async () => {
      const results = await Promise.all(
        SOURCES.map(async s => {
          try {
            const res: any = await get(s.url, { search: q, page: 1, per_page: 4 });
            const data = res?.data;
            const items: any[] = Array.isArray(data) ? data : (data?.items ?? data?.data ?? []);

            return items.slice(0, 4).map(s.map);
          } catch {
            return [];
          }
        })
      );

      if (stale) return;

      setHits(results.flat());
      setLoading(false);
    }, 280);

    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [q, enabled]);

  return { hits, loading, query: q };
}
