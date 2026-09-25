import { useEffect } from 'react';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useUser } from '@contexts/UserContext';

/**
 * Currency for the Fleet screens = the company's own currency (`companies.currency`, ISO 4217, from
 * GET /companies/{id} — flows/05 §12). Kept in a tiny module store so the many small money-formatting
 * helpers inside big screens (FleetDashboard) read it without prop-drilling; `useFleetCurrency()` is
 * called once by each screen and re-renders it when the value arrives or changes.
 */
let currentCurrency = 'USD';

export const getFleetCurrency = () => currentCurrency;

export const formatFleetMoney = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined) return '—';

  return `${currentCurrency} ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

export const useFleetCurrency = (): string => {
  const { user } = useUser();
  // Same query key as the company details screen, so the two share one cached response.
  const { data } = useSimpleQuery(
    'companyData',
    user?.company_id ? `/api/companies/${user.company_id}` : null,
    {},
    { enabled: !!user?.company_id }
  );
  // The fetched company is the fresh source of truth (it changes when the operator edits the
  // company); `user.company.currency` (POST /login, GET /profile) is only the first-paint value.
  const fetched = (data as any)?.success ? (data as any).data?.currency : null;
  const currency = fetched || (user as any)?.company?.currency || null;

  if (currency && typeof currency === 'string') currentCurrency = currency.toUpperCase();

  // Keep the store in step even if a later render swaps the company.
  useEffect(() => {
    if (currency && typeof currency === 'string') currentCurrency = currency.toUpperCase();
  }, [currency]);

  return currentCurrency;
};
