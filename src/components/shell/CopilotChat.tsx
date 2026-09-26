'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

interface Msg {
  id: number;
  role: 'user' | 'ai';
  text: string;
  bars?: { label: string; value: number; display: string }[];
  chips?: string[];
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
  if (/\bhos\b/.test(s) || s.includes('hours') || s.includes('driver') || s.includes('risk')) {
    return {
      text: 'Three drivers are predicted to reach their hours limit before 19:00 on current routes. Reassigning two trips keeps everyone compliant.',
      chips: ['Reassign trips', 'Notify drivers'],
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
  return {
    text: 'Yesterday the fleet drove 26,840 km across 412 trips with 91% on time. Fuel economy improved 4.1%, and two harsh-braking events were flagged for coaching.',
    chips: ['Open trips report', 'Coach drivers'],
  };
}

/** AI answer that types itself out, then reveals its chart bars and action chips. */
function AiBubble({ m }: { m: Msg }) {
  const [n, setN] = useState(0);
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const done = reduced || n >= m.text.length;

  useEffect(() => {
    if (reduced) return;

    const id = setInterval(() => setN(v => Math.min(m.text.length, v + 3)), 16);

    return () => clearInterval(id);
  }, [m.text, reduced]);

  return (
    <div className="self-start rounded-[18px_18px_18px_4px] border border-line-soft bg-white p-3.5 text-[13px] text-ink-1 shadow-card motion-rise">
      <span className={done ? '' : 'typing-caret'}>{done ? m.text : m.text.slice(0, n)}</span>
      {done && m.bars && (
        <div className="motion-stagger mt-3 flex flex-col gap-2">
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
              <b className="text-right font-semibold tabular-nums text-ink-0">{b.display}</b>
            </div>
          ))}
        </div>
      )}
      {done && m.chips && (
        <div className="motion-stagger mt-3 flex flex-wrap gap-2">
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
  );
}

/** Chat body (messages + input) shared by the copilot side panel and the AI workspace page. Mock answers. */
export default function CopilotChat({
  active = true,
  pendingQuestion,
  onConsumed,
  className = '',
}: {
  /** Whether the chat is currently visible (the panel keeps it mounted while closed). */
  active?: boolean;
  pendingQuestion?: string | null;
  onConsumed?: () => void;
  className?: string;
}) {
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
    if (active && pendingQuestion) {
      ask(pendingQuestion);
      onConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, pendingQuestion]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, thinking]);

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className}`}>
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
            <AiBubble key={m.id} m={m} />
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
    </div>
  );
}
