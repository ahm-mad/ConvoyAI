'use client';

import { useEffect, type ReactNode } from 'react';

/**
 * Token-styled modal dialog (replaces MUI Dialog). Backdrop + blur come from --backdrop-* tokens, the panel is
 * `glass-modal`. Closes on Escape / backdrop click unless `preventClose`.
 */
export default function Dialog({
  open,
  onClose,
  preventClose = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  preventClose?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !preventClose) onClose();
    };
    const prev = document.body.style.overflow;

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, preventClose, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1300] overflow-y-auto"
      style={{ background: 'var(--backdrop-overlay)', backdropFilter: 'var(--backdrop-blur)' }}
      onMouseDown={e => {
        if (e.target === e.currentTarget && !preventClose) onClose();
      }}
    >
      <div
        className="flex min-h-full items-center justify-center p-4"
        onMouseDown={e => {
          if (e.target === e.currentTarget && !preventClose) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          className="glass-modal relative w-auto max-w-fit overflow-visible p-5"
          style={{ backgroundImage: 'var(--gradient-modal-glow)' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
