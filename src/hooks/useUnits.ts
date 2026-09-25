import { useMemo } from 'react';
import { useFleetSettings } from '@hooks/useFleetSettings';
import { unitsFor, type Units } from '@utils/units';

/**
 * The company's unit system (`unit_system` in `/fleet/settings`, flows/07 U1). Falls back to metric while
 * the setting is loading or when the backend does not send the field yet, so nothing changes for anyone
 * until a company chooses another system.
 */
export function useUnits(): Units {
  const { settings } = useFleetSettings();

  return useMemo(() => unitsFor(settings?.unit_system), [settings?.unit_system]);
}
