// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { useState, useRef, useEffect } from 'react';
import { Send, Zap, Wrench, Shield } from 'lucide-react';
const agents = [
  {
    title: 'Maintenance Agent',
    description:
      'Predicts machine failure modes and triggers automated work orders before breakdowns occur.',
    icon: Wrench,
  },
  {
    title: 'Energy Optimization Agent',
    description:
      'Continuously balances grid demand, solar generation, and battery storage to achieve net-zero building operations.',
    icon: Zap,
  },
  {
    title: 'Security & Safety Agent',
    description:
      'Monitors access control, camera feeds, and fire systems to coordinate emergency egress and lockdowns automatically.',
    icon: Shield,
  },
];
// Canned replies so the demo feels alive without a real backend
function generateReply(userText) {
  const text = userText.toLowerCase();
  if (text.includes('hvac') || text.includes('chiller') || text.includes('energy')) {
    return {
      body: "I've analyzed Floor 4 occupancy schedules. Active personnel drops by 85% at 19:00. I recommend initiating the following automated adjustments:",
      actions: [
        {
          label: 'Reduce Chiller #2 output by 35%',
          status: 'Ready to execute',
        },
        {
          label: 'Set unoccupied temperature to 23.5°C',
          status: 'Ready to execute',
        },
      ],
    };
  }
  if (text.includes('security') || text.includes('lock') || text.includes('camera')) {
    return {
      body: 'All access points are currently nominal. I can tighten badge-in thresholds after hours if you want an extra layer tonight.',
      actions: [
        {
          label: 'Enable after-hours badge lockdown',
          status: 'Ready to execute',
        },
      ],
    };
  }
  return {
    body: "Got it — I'm cross-checking that against live building telemetry now. Here's a starting recommendation based on current sensor data:",
    actions: [
      {
        label: 'Run full diagnostics sweep',
        status: 'Ready to execute',
      },
    ],
  };
}
function ChatMessage({ role, body, actions }) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] items-start gap-2">
          <p className="rounded-xl rounded-tr-sm bg-[#1c2333] px-3.5 py-2.5 text-xs leading-relaxed text-white">
            {body}
          </p>
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#2a3245] text-[10px] font-semibold text-slate-200">
            ME
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-[90%] rounded-xl rounded-tl-sm border border-white/10 bg-[#030712] px-3.5 py-3">
      <p className="text-xs leading-relaxed text-slate-300">{body}</p>

      {actions && actions.length > 0 && (
        <div className="mt-3 space-y-2">
          {actions.map(a => (
            <div
              key={a.label}
              className="flex items-center justify-between rounded-lg bg-[#111827] px-3 py-2"
            >
              <span className="text-xs text-slate-100">{a.label}</span>
              <span className="font-mono text-[10px] text-emerald-400">{a.status}</span>
            </div>
          ))}
          <div className="mt-3 flex items-center gap-4">
            <button
              type="button"
              className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-300"
            >
              APPROVE &amp; AUTOMATE
            </button>
            <button
              type="button"
              className="text-xs font-medium text-slate-300 transition-colors hover:text-white"
            >
              MODIFY PLAN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
export function AIAgents() {
  const [messages, setMessages] = useState([
    {
      role: 'user',
      body: "How is the energy load on Floor 4 looking? Can we optimize the HVAC chiller runtime for tonight's occupancy drop?",
    },
    {
      role: 'ai',
      body: "I've analyzed Floor 4 occupancy schedules. Active personnel drops by 85% at 19:00. I recommend initiating the following automated adjustments:",
      actions: [
        {
          label: 'Reduce Chiller #2 output by 35%',
          status: 'Ready to execute',
        },
        {
          label: 'Set unoccupied temperature to 23.5°C',
          status: 'Ready to execute',
        },
      ],
    },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, typing]);
  function handleSend() {
    const text = input.trim();
    if (!text) return;
    setMessages(m => [
      ...m,
      {
        role: 'user',
        body: text,
      },
    ]);
    setInput('');
    setTyping(true);
    setTimeout(() => {
      const reply = generateReply(text);
      setMessages(m => [
        ...m,
        {
          role: 'ai',
          ...reply,
        },
      ]);
      setTyping(false);
    }, 900);
  }
  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSend();
  }
  return (
    <section className=" bg-[#030712] border-white/10 py-12 sm:py-16 md:py-24">
      <div className="mx-auto grid max-w-6xl gap-8 sm:gap-12 lg:gap-16 px-4 sm:px-6 grid-cols-1 lg:grid-cols-2 lg:items-center">
        {/* AI co-pilot chat panel */}
        <div className="rounded-2xl border border-white/10 bg-[#0a0e17] p-3 sm:p-4 min-w-0">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <span className="flex items-center gap-2 font-mono text-[11px] text-slate-200">
              <span className="size-1.5 animate-pulse rounded-full bg-cyan-400" />
              ConvoyAI AI CO-PILOT
            </span>
            <span className="font-mono text-[10px] text-emerald-400">
              Status: Autonomous Orchestrator Active
            </span>
          </div>

          <div ref={scrollRef} className="mt-4 max-h-96 space-y-3 overflow-y-auto pr-1">
            {messages.map((m, i) => (
              <ChatMessage key={i} {...m} />
            ))}

            {typing && (
              <div className="max-w-[60%] rounded-xl rounded-tl-sm border border-white/10 bg-[#030712] px-3.5 py-3">
                <div className="flex items-center gap-1">
                  <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-slate-400" />
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/10 bg-[#111827] px-3 py-2.5">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask ConvoyAI AI to run diagnostics or automate actions..."
              className="flex-1 bg-transparent text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none"
            />
            <button type="button" onClick={handleSend} aria-label="Send message">
              <Send className="size-4 text-cyan-400" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Copy */}
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Autonomous Operations
          </span>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
            AI Agents for Autonomous Infrastructure
          </h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-slate-300">
            Deploy specialized AI agents that continuously monitor, analyze, and optimize your
            systems. From energy management to threat response, ConvoyAI agents work 24/7 to reduce
            overhead and prevent failures.
          </p>

          <div className="mt-8 space-y-6">
            {agents.map(agent => {
              const Icon = agent.icon;
              return (
                <div key={agent.title} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#0a0e17]">
                    <Icon className="size-4.5 text-cyan-400" strokeWidth={1.75} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{agent.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-300">
                      {agent.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
