'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Building2, ChevronDown, CreditCard, MapPin, Plug } from 'lucide-react';
import { useUser } from '@contexts/UserContext';
import { useSimpleQuery } from '@hooks/useSimpleQuery';

/** The company the user is working in, with quick links to its settings (single-workspace accounts today). */
export default function WorkspaceChip() {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const q = useSimpleQuery<any>(
    'companyData',
    `/api/companies/${user?.company_id}`,
    {},
    {
      enabled: !!user?.company_id,
      staleTime: 300_000,
    }
  );
  const c = q.data?.data;

  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!c?.name) return null;

  const place = [c.city, c.country].filter(Boolean).join(', ');

  return (
    <div ref={ref} className="relative hidden min-[1760px]:block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="flex max-w-[11rem] items-center gap-2 rounded-full border border-line bg-white/70 px-3 py-1.5 text-[12.5px] font-medium text-ink-0 hover:bg-white"
      >
        <Building2 size={14} className="shrink-0 text-brand" />
        <span className="truncate">{c.name}</span>
        <ChevronDown size={13} className="shrink-0 text-ink-2" />
      </button>
      {open && (
        <div
          role="menu"
          className="glass-menu absolute left-0 top-[calc(100%+12px)] w-72 rounded-panel p-2"
        >
          <div className="px-3 pb-2 pt-2.5">
            <div className="eyebrow">Workspace</div>
            <div className="mt-0.5 truncate text-sm font-semibold text-ink-0">{c.name}</div>
            {place && (
              <div className="mt-0.5 flex items-center gap-1 text-xs text-ink-2">
                <MapPin size={12} /> {place}
              </div>
            )}
            {c.email && <div className="truncate text-xs text-ink-2">{c.email}</div>}
          </div>
          <div className="my-1 h-px bg-line-soft" />
          {[
            { href: '/company-location', label: 'Company & locations', icon: Building2 },
            { href: '/plan-management', label: 'Plan & usage', icon: CreditCard },
            { href: '/integration', label: 'Integrations', icon: Plug },
          ].map(l => (
            <Link
              key={l.href}
              href={l.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-ink-0 hover:bg-brand-wash/60"
            >
              <l.icon size={15} /> {l.label}
            </Link>
          ))}
          <div className="px-3 pb-2 pt-1.5 text-[11px] text-ink-2">
            Switching between workspaces is coming soon.
          </div>
        </div>
      )}
    </div>
  );
}
