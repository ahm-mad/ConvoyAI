import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Globe, X } from 'lucide-react';
import { useFleetSettings } from '@hooks/useFleetSettings';
import { detectTimezone, isUtcLike } from '@hooks/useDetectedTimezone';

const KEY = 'fleet-timezone-notice-dismissed';

const read = (): boolean => {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * A company that never set its Fleet timezone gets days counted in UTC. Nothing is assumed for it: this
 * strip points out that the browser is in a different zone and links to the settings page, where the
 * operator chooses (and sees what changes) — the zone is never applied automatically. Dismissible.
 */
export default function TimezoneNotice() {
  const { settings } = useFleetSettings();
  const pathname = usePathname() ?? '';
  const [dismissed, setDismissed] = useState(read);
  const detected = detectTimezone();

  if (
    dismissed ||
    !settings ||
    !isUtcLike(settings.timezone) ||
    isUtcLike(detected) ||
    pathname.startsWith('/fleet-management/settings')
  )
    return null;

  return (
    <div
      role="note"
      className="shrink-0 flex items-center gap-3 px-4 py-2 text-xs bg-surface-2 border-b border-line-soft text-ink-1"
    >
      <Globe size={13} className="shrink-0 text-ink-2" />
      <span className="min-w-0 flex-1">
        Fleet days are counted in <strong className="text-ink-0">UTC</strong> — this browser is in{' '}
        <strong className="text-ink-0">{detected}</strong>. Choose your company’s timezone so
        “Today” and daily totals start at local midnight.
      </span>
      <Link
        href="/fleet-management/settings"
        className="shrink-0 font-medium text-accent-cyan hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan rounded"
      >
        Set timezone
      </Link>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          try {
            window.localStorage.setItem(KEY, '1');
          } catch {
            /* private mode — dismissed for this visit only */
          }

          setDismissed(true);
        }}
        className="shrink-0 p-1 rounded text-ink-2 hover:text-ink-0 hover:bg-surface-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan"
      >
        <X size={13} />
      </button>
    </div>
  );
}
