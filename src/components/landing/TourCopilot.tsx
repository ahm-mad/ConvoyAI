'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles } from 'lucide-react';

interface Answer {
  q: string;
  text: string;
  rows?: [string, number, string][];
  action?: string;
}

const ANSWERS: Answer[] = [
  {
    q: 'Which vehicles will cost the most in fuel this week?',
    text: 'Five vehicles account for 38% of projected fuel spend. Two of them run the Karachi–Multan corridor with above-average idling.',
    rows: [
      ['KHI-2291', 92, 'PKR 84k'],
      ['LHE-1180', 78, 'PKR 71k'],
      ['KHI-0764', 66, 'PKR 60k'],
    ],
    action: 'Create idle-reduction plan',
  },
  {
    q: 'Who is close to their driving-hours limit?',
    text: 'Three drivers will pass the daily limit within 90 minutes. Bilal Sheikh is the most urgent: his Multan leg can be swapped with Adnan Awan, who starts in Faisalabad.',
    rows: [
      ['B. Sheikh', 94, '40 min left'],
      ['T. Yousafzai', 81, '66 min left'],
      ['N. Gill', 74, '88 min left'],
    ],
    action: 'Swap the Multan leg',
  },
  {
    q: 'Can we save time on the Lahore to Islamabad trips?',
    text: 'Rerouting 14 trips via M-9 avoids the Kallar Kahar congestion window and saves 46 minutes each, about PKR 412k this week.',
    rows: [
      ['M-2 (now)', 100, '3 h 40'],
      ['M-9 reroute', 78, '2 h 54'],
    ],
    action: 'Apply to all 14 trips',
  },
];

/** "Convoy Copilot" tab: pick a question, watch the answer stream in. Scripted, no network. */
export default function TourCopilot() {
  const [turns, setTurns] = useState<{ a: Answer; shown: number }[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const started = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);

  const ask = (a: Answer) => {
    if (timer.current) clearInterval(timer.current);

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    setTurns(t => [...t, { a, shown: reduce ? a.text.length : 0 }]);
    if (reduce) return;

    timer.current = setInterval(() => {
      setTurns(t => {
        const last = t[t.length - 1];

        if (!last || last.shown >= last.a.text.length) {
          if (timer.current) clearInterval(timer.current);

          return t;
        }

        return [
          ...t.slice(0, -1),
          { ...last, shown: Math.min(last.a.text.length, last.shown + 3) },
        ];
      });
    }, 22);
  };

  useEffect(() => {
    // Guards React 18 dev-mode's double-invoke of effects (mount → cleanup → mount), which would otherwise ask twice.
    if (started.current) return;

    started.current = true;
    ask(ANSWERS[0]);

    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  const asked = new Set(turns.map(t => t.a.q));

  return (
    <div className="flex h-[540px] flex-col" style={{ background: 'var(--gradient-copilot)' }}>
      <div
        ref={scroller}
        className="flex-1 space-y-4 overflow-y-auto p-5 md:p-8"
        aria-live="polite"
      >
        {turns.map(({ a, shown }, i) => (
          <div key={i} className="space-y-3">
            <div className="ml-auto w-fit max-w-[80%] rounded-[18px_18px_4px_18px] bg-ink-0 px-4 py-3 text-control text-white">
              {a.q}
            </div>
            <div className="glass-strong max-w-[640px] p-5 text-control text-ink-1">
              <div className="mb-2 flex items-center gap-2 text-caption font-semibold text-ai-ink">
                <span className="btn-ai grid size-6 place-items-center rounded-control">
                  <Sparkles size={12} fill="currentColor" />
                </span>
                Convoy Copilot
              </div>
              {a.text.slice(0, shown)}
              {shown < a.text.length && (
                <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-ai align-middle" />
              )}
              {shown >= a.text.length && a.rows && (
                <div className="mt-4 flex flex-col gap-2.5">
                  {a.rows.map(([n, w, v]) => (
                    <div
                      key={n}
                      className="grid grid-cols-[92px_1fr_86px] items-center gap-3 text-caption"
                    >
                      <span>{n}</span>
                      <div className="h-2 rounded-full bg-ai-wash">
                        <i
                          className="block h-full rounded-full"
                          style={{ width: `${w}%`, background: 'var(--gradient-ai)' }}
                        />
                      </div>
                      <b className="text-right tabular-nums text-ink-0">{v}</b>
                    </div>
                  ))}
                </div>
              )}
              {shown >= a.text.length && a.action && (
                <span className="btn-ai mt-4 inline-flex rounded-full px-4 py-2 text-caption font-semibold">
                  {a.action}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-line-soft bg-white/70 p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {ANSWERS.filter(a => !asked.has(a.q)).map(a => (
            <button
              key={a.q}
              type="button"
              onClick={() => ask(a)}
              className="rounded-full border border-line bg-white px-3.5 py-1.5 text-caption font-medium text-ink-0 hover:border-ai hover:text-ai-ink"
            >
              {a.q}
            </button>
          ))}
          {asked.size === ANSWERS.length && (
            <span className="text-caption text-ink-2">
              Ask anything about your own fleet after you sign up.
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2.5 text-control text-ink-2">
          <span className="flex-1">Ask about costs, risk, maintenance, routes…</span>
          <Send size={15} aria-hidden />
        </div>
      </div>
    </div>
  );
}
