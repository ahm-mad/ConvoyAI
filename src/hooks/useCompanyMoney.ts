import { useUser } from '@contexts/UserContext';
import { useSimpleQuery } from '@hooks/useSimpleQuery';

/**
 * Compact money formatter in the company's own currency (set per company, never hard-coded). Until the company has
 * loaded (or has no currency) the amount is shown as a plain compact number.
 */
export function useCompanyMoney() {
  const { user } = useUser();
  const company = useSimpleQuery<any>(
    'companyData',
    `/api/companies/${user?.company_id}`,
    {},
    { enabled: !!user?.company_id, staleTime: 300_000 }
  );
  const currency: string | undefined = company.data?.data?.currency || undefined;

  return (amount: number): string => {
    try {
      return new Intl.NumberFormat('en', {
        ...(currency ? { style: 'currency', currency } : {}),
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(amount);
    } catch {
      return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(
        amount
      );
    }
  };
}
