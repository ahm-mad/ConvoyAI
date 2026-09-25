import { useSimpleQuery } from '@hooks/useSimpleQuery';

export interface FleetOptions {
  fuel_types: string[];
  ownership_types: string[];
  employment_statuses: string[];
  availability_statuses: string[];
  /** Distinct vehicle categories in use in the company (free text, case-insensitively collapsed). */
  vehicle_categories: string[];
}

const EMPTY: FleetOptions = {
  fuel_types: [],
  ownership_types: [],
  employment_statuses: [],
  availability_statuses: [],
  vehicle_categories: [],
};

/** "full_time" -> "Full time" (the API values stay lowercase; only the label is friendly). */
const ACRONYMS: Record<string, string> = { lpg: 'LPG', cng: 'CNG' };

export const optionLabel = (value: string): string => {
  if (ACRONYMS[value]) return ACRONYMS[value];

  const text = value.replace(/_/g, ' ');

  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * Canonical value lists for vehicle/driver fields (GET /fleet/options, flows/05 §11). Backend rejects
 * anything else with a fixed 422, so the Add/Edit forms render these as dropdowns.
 */
export const useFleetOptions = (): { options: FleetOptions; isLoading: boolean } => {
  const { data, isLoading } = useSimpleQuery('fleet-options', '/api/fleet/options');
  const raw: any = (data as any)?.success ? (data as any).data : null;

  return { options: raw ? { ...EMPTY, ...raw } : EMPTY, isLoading };
};
