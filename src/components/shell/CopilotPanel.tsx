'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Sparkles, X } from 'lucide-react';

interface Msg {
  id: number;
  role: 'user' | 'ai';
  text: string;
  bars?: { label: string; value: number; display: string }[];
  chips?: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** A question handed over by the command palette; answered as soon as the panel opens. */
  pendingQuestion?: string | null;
  onConsumed?: () => void;
}

const STARTERS = ['Predict maintenance', 'HOS breach risks', 'Summarise yesterday'];

/** Mock AI answers (no backend, on purpose): believable fleet insights keyed on the question. */
function answer(q: string): Omit<Msg, 'id' | 'role'> {
  const s = q.toLowerCase();
  if (s.includes('fuel')) {
    return {
      text: 'Five vehicles account for 38% of projected fuel spend this week. Two of them idle for more than 22% of engine time.',
      bars: [
        { label: 'KHI-2291', value: 92, display: 'PKR 84k' },
        { label: 'LHE-1180', value: 78, display: 'PKR 71k' },
        { label: 'KHI-0764', value: 66, display: 'PKR 60k' },
        { label: 'ISB-3302', value: 51, display: 'PKR 47k' },
      ],
      chips: ['Create idle-reduction plan', 'See route options'],
    };
  }
  if (s.includes('maint') || s.includes('service')) {
    return {
      text: 'Three vehicles are likely to need brake service within 9 days based on a 31% rise in hard stops. Booking them this week avoids an estimated 2 days of unplanned downtime.',
      bars: [
        { label: 'KHI-0764', value: 88, display: '9 days' },
        { label: 'LHE-1180', value: 71, display: '12 days' },
        { label: 'ISB-3302', value: 46, display: '19 days' },
      ],
      chips: ['Schedule services', 'Show wear trend'],
    };
  }
  if (s.includes('hos') || s.includes('hours') || s.includes('driver')) {
    return {
      text: 'Three drivers are predicted to reach their hours limit before 19:00 on current routes. Reassigning two trips keeps everyone compliant.',
      chips: ['Reassign trips', 'Notify drivers'],
    };
  }
  return {
    text: 'Yesterday the fleet drove 26,840 km across 412 trips with 91% on time. Fuel economy improved 4.1%, and two harsh-braking events were flagged for coaching.',
    chips: ['Open trips report', 'Coach drivers'],
  };
}

export default function CopilotPanel({ open, onClose, pendingQuestion, onConsumed }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const idRef = useRef(0);
  const endRef = useRef<HTMLDivElement | null>(null);

  const ask = (q: string) => {
    const text = q.trim();
    if (!text) return;
    setMsgs(m => [...m, { id: ++idRef.current, role: 'user', text }]);
    setInput('');
    setThinking(true);
    setTimeout(() => {
      setMsgs(m => [...m, { id: ++idRef.current, role: 'ai', ...answer(text) }]);
      setThinking(false);
    }, 900);
  };

  useEffect(() => {
    if (open && pendingQuestion) {
      ask(pendingQuestion);
      onConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingQuestion]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, thinking]);

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
        className={`glass fixed bottom-4 right-4 top-4 z-[90] flex w-[min(440px,calc(100vw-32px))] flex-col overflow-hidden transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-[calc(100%+32px)]'}`}
        style={{ background: 'var(--gradient-copilot)' }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-44"
          style={{ background: 'var(--gradient-copilot-glow)' }}
        />
        <header className="relative flex items-center gap-3 px-5 pb-3 pt-5">
          <div
            className="relative size-10 rounded-full shadow-ai"
            style={{ background: 'var(--gradient-ai-orb)' }}
          >
            <span
              className="absolute inset-1 rounded-full"
              style={{ background: 'var(--gradient-orb-core)' }}
            />
          </div>
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

        <div className="relative flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-2">
          {msgs.length === 0 && (
            <div className="my-auto text-center">
              <div className="btn-ai mx-auto mb-4 grid size-14 place-items-center rounded-2xl">
                <Sparkles size={26} fill="currentColor" />
              </div>
              <p className="font-serif-display text-3xl text-ink-0">What should we look at?</p>
              <p className="mx-auto mt-2 max-w-[280px] text-[13px] text-ink-2">
                Costs, risk, maintenance, routes. Convoy reads your live fleet data and suggests
                actions.
              </p>
            </div>
          )}
          {msgs.map(m =>
            m.role === 'user' ? (
              <div
                key={m.id}
                className="max-w-[82%] self-end rounded-[18px_18px_4px_18px] bg-ink-0 px-3.5 py-2.5 text-[13px] text-white"
              >
                {m.text}
              </div>
            ) : (
              <div
                key={m.id}
                className="self-start rounded-[18px_18px_18px_4px] border border-line-soft bg-white p-3.5 text-[13px] text-ink-1 shadow-card"
              >
                {m.text}
                {m.bars && (
                  <div className="mt-3 flex flex-col gap-2">
                    {m.bars.map(b => (
                      <div
                        key={b.label}
                        className="grid grid-cols-[72px_1fr_64px] items-center gap-2.5 text-xs"
                      >
                        <span>{b.label}</span>
                        <div className="h-2 rounded-full bg-ai-wash">
                          <i
                            className="block h-full rounded-full"
                            style={{ width: `${b.value}%`, background: 'var(--gradient-ai)' }}
                          />
                        </div>
                        <b className="text-right font-semibold tabular-nums text-ink-0">
                          {b.display}
                        </b>
                      </div>
                    ))}
                  </div>
                )}
                {m.chips && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.chips.map((c, i) => (
                      <span
                        key={c}
                        className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${i === 0 ? 'bg-brand-wash text-brand-ink' : 'bg-ai-wash text-ai-ink'}`}
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          )}
          {thinking && (
            <div
              className="flex items-center gap-1.5 self-start rounded-full bg-white px-4 py-3 shadow-card"
              aria-label="Convoy is thinking"
            >
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="size-1.5 animate-bounce rounded-full bg-ai"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              ))}
            </div>
          )}
          <div ref={endRef} />
        </div>

        <footer className="relative px-4 pb-4 pt-2">
          {msgs.length === 0 && (
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {STARTERS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  className="whitespace-nowrap rounded-full border border-line bg-white/70 px-3 py-1.5 text-xs text-ink-1 transition-colors hover:bg-white"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={e => {
              e.preventDefault();
              ask(input);
            }}
            className="flex items-center gap-2 rounded-full border border-line bg-white py-2 pl-5 pr-2 shadow-card"
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask Convoy…"
              className="w-full bg-transparent text-[13.5px] text-ink-0 outline-none placeholder:text-ink-2"
              aria-label="Ask Convoy"
            />
            <button
              type="submit"
              aria-label="Send"
              className="btn-ai grid size-9 shrink-0 place-items-center rounded-full"
            >
              <ArrowRight size={16} strokeWidth={2.4} />
            </button>
          </form>
        </footer>
      </aside>
    </>
  );
}
