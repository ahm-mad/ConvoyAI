import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * The scope of a report: WHICH vehicles the numbers are about (backend B0 scope filters, flows/07 §24.2 /
 * §32.3). Kept in the URL next to the range (`?category=Van&vehicle=1,2&yard=5`) so a scoped view can be
 * bookmarked, shared and survives reload. Each page passes the fields its WHOLE page can honour — a filter
 * that only some widgets respect would make the charts and the table disagree, so it is not offered.
 */
export type ScopeField = 'category' | 'vehicle' | 'yard' | 'driver' | 'costCentre';

/** URL query key of each field. */
export const SCOPE_URL_KEY: Record<ScopeField, string> = {
  category: 'category',
  vehicle: 'vehicle',
  yard: 'yard',
  driver: 'driver',
  costCentre: 'costcentre',
};

/** Fields that mean the same thing on every page that offers them (carried by the Fleet navigation). */
export const CARRIED_SCOPE_KEYS = [SCOPE_URL_KEY.category, SCOPE_URL_KEY.vehicle];

export const MAX_SCOPE_VEHICLES = 20;
export const MAX_SCOPE_DRIVERS = 10;

export interface ScopeValues {
  category: string | null;
  vehicle: string[];
  yard: string | null;
  driver: string[];
  costCentre: string | null;
}

const ids = (raw: string | null, max: number) =>
  Array.from(
    new Set(
      (raw ?? '')
        .split(',')
        .map(x => x.trim())
        .filter(x => /^\d+$/.test(x))
    )
  ).slice(0, max);

export function useAnalyticsScope(fields: ScopeField[]) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const allowed = useMemo(() => new Set(fields), [fields]);

  const text = (f: ScopeField) => (allowed.has(f) ? params.get(SCOPE_URL_KEY[f]) || null : null);
  const yardRaw = allowed.has('yard') ? params.get(SCOPE_URL_KEY.yard) : null;

  const values: ScopeValues = {
    category: text('category'),
    vehicle: allowed.has('vehicle')
      ? ids(params.get(SCOPE_URL_KEY.vehicle), MAX_SCOPE_VEHICLES)
      : [],
    yard: yardRaw && /^\d+$/.test(yardRaw) ? yardRaw : null,
    driver: allowed.has('driver') ? ids(params.get(SCOPE_URL_KEY.driver), MAX_SCOPE_DRIVERS) : [],
    costCentre: text('costCentre'),
  };

  /** The request parameters (`vehicle_category`, `vehicle_id`, `yard_id`, `driver_id`, `cost_centre`). */
  const api = useMemo(() => {
    const o: Record<string, string> = {};

    if (values.category) o.vehicle_category = values.category;

    if (values.vehicle.length) o.vehicle_id = values.vehicle.join(',');

    if (values.yard) o.yard_id = values.yard;

    if (values.driver.length) o.driver_id = values.driver.join(',');

    if (values.costCentre) o.cost_centre = values.costCentre;

    return o;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    values.category,
    values.vehicle.join(','),
    values.yard,
    values.driver.join(','),
    values.costCentre,
  ]);

  const active = Object.keys(api).length;
  /** Changes whenever the scope does — pages reset their table to page 1 on it. */
  const key = JSON.stringify(api);

  const push = useCallback(
    (next: Record<string, string | null>) => {
      const sp = new URLSearchParams(params.toString());

      Object.entries(next).forEach(([k, v]) =>
        v === null || v === '' ? sp.delete(k) : sp.set(k, v)
      );

      const qs = sp.toString();

      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );

  const set = (field: ScopeField, value: string | string[] | null) =>
    push({ [SCOPE_URL_KEY[field]]: Array.isArray(value) ? value.join(',') || null : value });

  const clear = () =>
    push(Object.fromEntries(fields.map(f => [SCOPE_URL_KEY[f], null])) as Record<string, null>);

  return { fields, values, api, active, key, set, clear };
}

export type AnalyticsScope = ReturnType<typeof useAnalyticsScope>;
