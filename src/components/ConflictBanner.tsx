/* eslint-disable @typescript-eslint/no-explicit-any */
import { fullName, when } from '@components/AuditLine';

/**
 * Shown when a fleet `PUT` was refused with HTTP 409 (backend B13, flows/06 §23): the record was changed
 * by someone else after this form was opened. `current` = `{ updated_at, updated_by, updated_by_user }`;
 * `updated_by: null` means the last change was automatic ("System"). Nothing was written — the operator
 * reloads the latest record and re-applies their edit.
 */
export default function ConflictBanner({
  current,
  onReload,
}: {
  current: any;
  onReload: () => void;
}) {
  const who =
    fullName(current?.updated_by_user) ?? (current?.updated_by ? 'another user' : 'System');
  const at = when(current?.updated_at);

  return (
    <div
      role="alert"
      data-testid="conflict-banner"
      className="flex items-start justify-between gap-3 text-xs bg-danger/10 text-danger border border-danger/30 rounded-md px-3 py-2 mb-3"
    >
      <span>
        This record was changed by <strong>{who}</strong>
        {at ? ` at ${at}` : ''} after you opened it, so your changes were not saved. Reload the
        latest version and apply your edit again.
      </span>
      <button
        type="button"
        onClick={onReload}
        className="shrink-0 border border-danger/40 rounded-md px-2.5 py-1 hover:bg-danger/10"
      >
        Reload latest
      </button>
    </div>
  );
}
