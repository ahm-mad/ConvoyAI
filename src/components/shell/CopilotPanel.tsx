'use client';

import { useEffect, useState } from 'react';
import AiOrb, { type AiOrbState } from '@components/ui/AiOrb';
import { X } from 'lucide-react';
import CopilotChat from './CopilotChat';

interface Props {
  open: boolean;
  onClose: () => void;
  /** A question handed over by the command palette; answered as soon as the panel opens. */
  pendingQuestion?: string | null;
  onConsumed?: () => void;
}

export default function CopilotPanel({ open, onClose, pendingQuestion, onConsumed }: Props) {
  const [orb, setOrb] = useState<AiOrbState>('idle');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();

    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`fixed inset-0 z-[80] bg-ink-0/20 backdrop-blur-[2px] transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        aria-label="Convoy Copilot"
        aria-hidden={!open}
        inert={!open}
        className={`glass fixed bottom-4 right-4 top-4 z-[90] flex w-[min(440px,calc(100vw-32px))] flex-col overflow-hidden transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-[calc(100%+32px)]'}`}
        style={{ background: 'var(--gradient-copilot)' }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-44"
          style={{ background: 'var(--gradient-copilot-glow)' }}
        />
        <header className="relative flex items-center gap-3 px-5 pb-3 pt-5">
          <AiOrb state={orb} className="size-10" />
          <div>
            <h2 className="text-base font-semibold text-ink-0">Convoy Copilot</h2>
            <p className="text-xs text-ink-2">Ask anything about your fleet</p>
          </div>
          <span className="ml-auto rounded-full bg-ai-wash px-2.5 py-0.5 text-[11.5px] font-semibold text-ai-ink">
            Preview
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close copilot"
            className="grid size-8 place-items-center rounded-full text-ink-1 hover:bg-black/[0.06]"
          >
            <X size={16} />
          </button>
        </header>

        <CopilotChat
          active={open}
          pendingQuestion={pendingQuestion}
          onConsumed={onConsumed}
          onOrbState={setOrb}
        />
      </aside>
    </>
  );
}
