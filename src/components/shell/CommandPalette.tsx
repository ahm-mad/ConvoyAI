'use client';

import { useEffect } from 'react';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { Search, Sparkles } from 'lucide-react';
import { useUser } from '@contexts/UserContext';
import { buildNav, flattenNav } from './nav-config';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAsk: (q: string) => void;
}

const SUGGESTIONS = [
  'Which vehicles will cost the most in fuel this week?',
  'Who is at risk of an hours-of-service breach?',
  'Predict maintenance for next month',
];

/** ⌘K / Ctrl+K command palette: jump to any screen or hand a question to the AI copilot. */
export default function CommandPalette({ open, onOpenChange, onAsk }: Props) {
  const router = useRouter();
  const { user, isSuperAdmin, hasPermission } = useUser();
  const leaves = flattenNav(buildNav({ isSuperAdmin, isDemo: user?.isDemo, hasPermission }));
  const groups = Array.from(new Set(leaves.map(l => l.group)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      } else if (open && e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-ink-0/30 px-4 pt-[14vh] backdrop-blur-sm"
      onMouseDown={e => e.target === e.currentTarget && onOpenChange(false)}
    >
      <Command
        label="Command palette"
        className="glass-menu w-full max-w-[640px] overflow-hidden rounded-modal"
        style={{ boxShadow: 'var(--shadow-modal)' }}
      >
        <div className="flex items-center gap-3 border-b border-line-soft px-5 py-4">
          <Search size={18} className="text-ink-2" />
          <Command.Input
            autoFocus
            placeholder="Search screens, or ask Convoy anything…"
            className="w-full bg-transparent text-[15px] text-ink-0 outline-none placeholder:text-ink-2"
          />
          <kbd className="rounded-md border border-line bg-white px-1.5 py-px font-mono text-[11px] text-ink-1">
            esc
          </kbd>
        </div>
        <Command.List className="max-h-[52vh] overflow-y-auto p-2.5">
          <Command.Empty className="px-4 py-8 text-center text-sm text-ink-2">
            No matching screens.
          </Command.Empty>

          <Command.Group
            heading="Ask Convoy AI"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-ink-2"
          >
            {SUGGESTIONS.map(q => (
              <Command.Item
                key={q}
                value={`ask ${q}`}
                onSelect={() => {
                  onOpenChange(false);
                  onAsk(q);
                }}
                className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-[13.5px] text-ink-0 data-[selected=true]:bg-ai-wash"
              >
                <span className="btn-ai grid size-8 place-items-center rounded-xl">
                  <Sparkles size={15} fill="currentColor" />
                </span>
                {q}
              </Command.Item>
            ))}
          </Command.Group>

          {groups.map(group => (
            <Command.Group
              key={group}
              heading={group}
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-ink-2"
            >
              {leaves
                .filter(l => l.group === group)
                .map(l => {
                  const Icon = l.icon;
                  return (
                    <Command.Item
                      key={l.href}
                      value={`${group} ${l.label} ${l.hint ?? ''}`}
                      onSelect={() => {
                        onOpenChange(false);
                        router.push(l.href);
                      }}
                      className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-[13.5px] text-ink-0 data-[selected=true]:bg-brand-wash/70"
                    >
                      <span className="grid size-8 place-items-center rounded-xl bg-brand-wash text-brand icon-gradient">
                        <Icon size={16} />
                      </span>
                      <span className="font-medium">{l.label}</span>
                      {l.hint && (
                        <span className="ml-auto truncate text-xs text-ink-2">{l.hint}</span>
                      )}
                    </Command.Item>
                  );
                })}
            </Command.Group>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}
