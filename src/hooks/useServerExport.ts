import { useState } from 'react';
import toast from 'react-hot-toast';
import { downloadServerCsv } from '@utils/serverExport';

/**
 * "Export CSV" of everything the list currently matches (backend B11): the list's own params go to
 * `GET {path}` and the server streams the file. `noun` is the plural used in the confirmation toast.
 */
export function useServerExport(path: string, noun: string) {
  const [busy, setBusy] = useState(false);

  const run = async (params: Record<string, unknown>) => {
    setBusy(true);

    try {
      const { rows } = await downloadServerCsv(path, params, `${noun}.csv`);

      toast.success(
        rows === null ? `Exported ${noun}.` : `Exported ${rows.toLocaleString()} ${noun}.`
      );
    } catch (e) {
      toast.error((e as Error).message || 'Could not export.');
    } finally {
      setBusy(false);
    }
  };

  return { run, busy };
}
