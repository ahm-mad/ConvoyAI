import { useState } from 'react';

/**
 * A delete action with an inline two-step confirm (never window.confirm — browser dialogs freeze the
 * automation and are ugly). `question` explains what will be lost; `onConfirm` returns when done.
 */
export default function DeleteControl({
  label = 'Delete',
  question,
  onConfirm,
  compact = false,
}: {
  label?: string;
  question: string;
  onConfirm: () => Promise<void> | void;
  compact?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const size = compact ? 'text-micro px-2.5 py-0.5' : 'text-caption font-medium px-3 py-1';

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className={`${size} text-danger-text border border-danger/30 rounded-full hover:bg-danger/10`}
      >
        {label}
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 flex-wrap text-[11px] text-ink-1">
      {question}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);

          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setAsking(false);
          }
        }}
        className={`${size} text-danger-text border border-danger/40 bg-danger/10 rounded-full disabled:opacity-40`}
      >
        {busy ? 'Deleting…' : `Yes, ${label.toLowerCase()}`}
      </button>
      <button
        type="button"
        onClick={() => setAsking(false)}
        className={`${size} text-ink-2 border border-line bg-white rounded-full`}
      >
        Keep
      </button>
    </span>
  );
}
