/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import ConflictBanner from '@components/ConflictBanner';
import { invalidateFleetQueries } from '@utils/fleetCache';

/**
 * Optimistic-concurrency helper for the fleet edit forms (backend B13, flows/06 §23).
 *
 * - `token` — the record's `updated_at` as it was when the form opened; send it as `expected_updated_at`
 *   (captured once: a later refetch must not silently refresh it while the form still shows old values).
 * - `handle(response)` — call it on a failed `PUT`; returns true (and raises the banner) for a 409.
 * - `banner` — render it above the form; "Reload latest" refetches every fleet query and calls `onReload`
 *   (normally closing the form so it reopens on the fresh record).
 * - `conflicted` — disable Save while the banner is up (retrying the stale token would just 409 again).
 */
export function useEditConflict(record: any, onReload?: () => void) {
  const qc = useQueryClient();
  const [token] = useState<string | undefined>(() => record?.updated_at ?? undefined);
  const [current, setCurrent] = useState<any>(null);

  const handle = (response: any): boolean => {
    if (response?.status !== 409) return false;

    setCurrent(response.current ?? {});

    return true;
  };

  const banner: ReactNode = current ? (
    <ConflictBanner
      current={current}
      onReload={() => {
        invalidateFleetQueries(qc);
        setCurrent(null);
        onReload?.();
      }}
    />
  ) : null;

  return {
    /** Spread into the PUT body: `{ ...payload, ...expected }`. Empty when the record had no `updated_at`. */
    expected: token ? { expected_updated_at: token } : {},
    handle,
    banner,
    conflicted: !!current,
  };
}
