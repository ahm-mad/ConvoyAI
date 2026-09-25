import type { QueryClient } from '@tanstack/react-query';

/** Query keys are [name, params] (useSimpleQuery) — match on the name only. */
export const isFleetKey = (name: string) =>
  name.startsWith('fleet-') ||
  name.startsWith('trip') ||
  name.startsWith('vehicle') ||
  name.startsWith('geofence') ||
  name.startsWith('yard') ||
  name.startsWith('driver') ||
  name === 'assignable-trackers';

export const invalidateFleetQueries = (
  qc: QueryClient,
  match: (name: string) => boolean = isFleetKey
) =>
  qc.invalidateQueries({
    predicate: q => typeof q.queryKey[0] === 'string' && match(q.queryKey[0] as string),
  });
