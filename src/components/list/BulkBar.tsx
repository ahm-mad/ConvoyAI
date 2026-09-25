import { useState } from 'react';
import type { BulkResult } from '@hooks/useBulkAction';

/**
 * The bar that appears while rows are selected: "3 selected · Deactivate (2) · Reactivate (1) · Clear",
 * plus the outcome of the last bulk run, listing each refused record with backend's reason.
 */
export default function BulkBar({
  count,
  actions,
  onClear,
  running,
  result,
  onDismissResult,
  allMatching = false,
}: {
  count: number;
  actions: {
    label: string;
    count: number;
    danger?: boolean;
    /** When set, the first click asks this question inline and only a second click runs the action. */
    confirm?: string;
    onClick: () => void;
  }[];
  /** True when "all N matching" is selected (rows are not enumerated). */
  allMatching?: boolean;
  onClear: () => void;
  running: boolean;
  result: BulkResult | null;
  onDismissResult: () => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);

  if (count === 0 && !result) return null;

  return (
    <div className="mb-3">
      {count > 0 && (
        <div className="flex items-center gap-3 flex-wrap bg-accent-cyan/10 border border-accent-cyan/30 rounded-full px-3 py-2 text-caption font-medium">
          <span className="text-accent-cyan font-medium">
            {allMatching ? `All ${count} matching selected` : `${count} selected`}
          </span>
          {actions.map(a =>
            confirming === a.label ? (
              <span
                key={a.label}
                className="flex items-center gap-2 border border-danger/40 bg-danger/10 rounded px-2 py-1 text-ink-1"
              >
                {a.confirm}
                <button
                  type="button"
                  disabled={running}
                  onClick={() => {
                    setConfirming(null);
                    a.onClick();
                  }}
                  className="text-danger border border-danger/40 rounded px-2 py-0.5 hover:bg-danger/10"
                >
                  Yes, {a.label.toLowerCase()}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  className="text-ink-2 hover:text-ink-0"
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                key={a.label}
                type="button"
                disabled={running || a.count === 0}
                onClick={() => (a.confirm ? setConfirming(a.label) : a.onClick())}
                className={`border rounded px-2.5 py-1 disabled:opacity-40 ${
                  a.danger
                    ? 'text-danger border-danger/40 hover:bg-danger/10'
                    : 'text-accent-green border-accent-green/40 hover:bg-accent-green/10'
                }`}
              >
                {running ? 'Working…' : `${a.label} (${a.count})`}
              </button>
            )
          )}
          <button type="button" onClick={onClear} className="text-ink-2 hover:text-ink-0 ml-auto">
            Clear selection
          </button>
        </div>
      )}

      {result && (
        <div
          className={`mt-2 rounded-md px-3 py-2 text-[11px] ${
            result.failures.length
              ? 'bg-warning/10 text-ink-1'
              : 'bg-accent-green/10 text-accent-green'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-medium">{result.label}</span>
            <button type="button" onClick={onDismissResult} className="text-ink-2 hover:text-ink-0">
              Dismiss
            </button>
          </div>
          {result.failures.length > 0 && (
            <ul className="mt-1 space-y-0.5 list-disc pl-4">
              {result.failures.map(f => (
                <li key={f.id}>
                  <strong>{f.name}</strong> — {f.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
