'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  ChevronDown,
  LogOut,
  Search,
  Settings,
  Sparkles,
  Building,
  Route as RouteIcon,
} from 'lucide-react';
import { useUser } from '@contexts/UserContext';
import { disconnectSocket } from '@contexts/SocketContext';
import { buildNav, type NavGroup } from './nav-config';

interface Props {
  onOpenPalette: () => void;
  onOpenCopilot: () => void;
}

function initials(name?: string | null) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'U';
}

/**
 * ConvoyAI floating pill navigation (replaces the old left sidebar + top navbar).
 * Groups with children open a glass mega-menu on hover/focus/click; the rest are direct links.
 */
export default function FloatingNav({ onOpenPalette, onOpenCopilot }: Props) {
  const { user, uploadedImage, setUploadedImage, isSuperAdmin, hasPermission } = useUser();
  const pathname = usePathname() ?? '';
  const [open, setOpen] = useState<string | null>(null);
  const [userMenu, setUserMenu] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const groups = buildNav({ isSuperAdmin, isDemo: user?.isDemo, hasPermission });

  useEffect(() => {
    setOpen(null);
    setUserMenu(false);
  }, [pathname]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(null);
        setUserMenu(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(null);
        setUserMenu(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const isActive = (g: NavGroup) =>
    g.match.some(m => pathname === m || pathname.startsWith(`${m}/`));

  const hoverOpen = (key: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setUserMenu(false);
    setOpen(key);
  };
  const hoverClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(null), 140);
  };

  const displayName =
    `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim() || user?.email || 'Account';

  const handleLogout = () => {
    if (user) disconnectSocket(user?.id);
    setUploadedImage(null);
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/login';
  };

  return (
    <nav
      ref={rootRef}
      aria-label="Main"
      className="glass sticky top-3.5 z-40 mx-auto mb-6 mt-3.5 flex w-[calc(100%-32px)] max-w-nav items-center gap-3 glass-pill py-2.5 pl-4 pr-2.5"
    >
      <Link
        href="/fleet-management/operations/overview"
        className="flex shrink-0 items-center gap-2.5 pr-2"
      >
        <span className="brand-gradient-bg grid size-8 place-items-center rounded-[10px] shadow-glow">
          <RouteIcon size={17} className="text-white" strokeWidth={2.4} />
        </span>
        <span className="card-title">
          Convoy<em className="font-serif-display pl-0.5 text-[19px] italic text-brand">AI</em>
        </span>
      </Link>

      <ul className="ml-1 hidden items-center gap-0.5 lg:flex">
        {groups.map(g => {
          const active = isActive(g);
          const Icon = g.icon;
          const hasMenu = g.items.length > 0;
          const base =
            'flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[13.5px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand';
          const tone = active
            ? 'bg-ink-0 text-white'
            : open === g.key
              ? 'bg-black/[0.06] text-ink-0'
              : 'text-ink-1 hover:bg-black/[0.06]';

          return (
            <li
              key={g.key}
              className="relative"
              onMouseEnter={() => hasMenu && hoverOpen(g.key)}
              onMouseLeave={hoverClose}
            >
              {hasMenu ? (
                <button
                  type="button"
                  className={`${base} ${tone}`}
                  aria-haspopup="menu"
                  aria-expanded={open === g.key}
                  onClick={() => setOpen(open === g.key ? null : g.key)}
                >
                  <Icon size={15} />
                  {g.label}
                  <ChevronDown
                    size={13}
                    className={`transition-transform ${open === g.key ? 'rotate-180' : ''}`}
                  />
                </button>
              ) : (
                <Link
                  href={g.href ?? '#'}
                  aria-current={active ? 'page' : undefined}
                  className={`${base} ${tone}`}
                >
                  <Icon size={15} />
                  {g.label}
                </Link>
              )}

              {hasMenu && open === g.key && (
                <div
                  role="menu"
                  className="glass-strong absolute left-0 top-[calc(100%+12px)] w-[380px] rounded-3xl p-2.5"
                  style={{ boxShadow: 'var(--shadow-glass)' }}
                >
                  <div className="px-3 pb-1.5 pt-2 eyebrow">{g.label}</div>
                  <div className="grid grid-cols-1 gap-0.5">
                    {g.items.map(item => {
                      const ItemIcon = item.icon;
                      const here = pathname === item.href || pathname.startsWith(`${item.href}/`);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          role="menuitem"
                          className={`group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-brand-wash/60 ${here ? 'bg-brand-wash/70' : ''}`}
                        >
                          <span className="grid size-9 place-items-center rounded-xl bg-brand-wash text-brand transition-transform group-hover:scale-105">
                            <ItemIcon size={17} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[13.5px] font-semibold text-ink-0">
                              {item.label}
                            </span>
                            {item.hint && (
                              <span className="block truncate text-xs text-ink-2">{item.hint}</span>
                            )}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <span className="flex-1" />

      <button
        type="button"
        onClick={onOpenPalette}
        className="hidden min-w-[210px] items-center gap-2.5 rounded-full bg-black/[0.05] px-3.5 py-2 text-[13px] text-ink-2 transition-colors hover:bg-black/[0.08] md:flex"
        aria-label="Open command palette"
      >
        <Search size={15} />
        Search fleet
        <kbd className="ml-auto rounded-md border border-line bg-white px-1.5 py-px font-mono text-[11px] text-ink-1">
          ⌘K
        </kbd>
      </button>

      <button
        type="button"
        onClick={onOpenCopilot}
        className="btn-ai flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold transition-transform hover:-translate-y-px"
      >
        <Sparkles size={15} fill="currentColor" />
        <span className="hidden sm:inline">Ask Convoy</span>
      </button>

      <button
        type="button"
        aria-label="Notifications"
        className="relative grid size-[38px] place-items-center rounded-full border border-line bg-white text-ink-1 transition-colors hover:bg-surface-2"
      >
        <Bell size={16} />
        <span className="absolute right-2 top-2 size-2 rounded-full border-2 border-white bg-gold" />
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setOpen(null);
            setUserMenu(v => !v);
          }}
          aria-haspopup="menu"
          aria-expanded={userMenu}
          aria-label="Account menu"
          className="grid size-[38px] place-items-center overflow-hidden rounded-full border-2 border-white text-[13px] font-semibold text-white shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          style={{ background: 'var(--gradient-avatar)' }}
        >
          {uploadedImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={uploadedImage} alt="" className="size-full object-cover" />
          ) : (
            initials(displayName)
          )}
        </button>
        {userMenu && (
          <div
            role="menu"
            className="glass-strong absolute right-0 top-[calc(100%+12px)] w-64 rounded-3xl p-2"
          >
            <div className="px-3 pb-2 pt-2.5">
              <div className="truncate text-sm font-semibold text-ink-0">{displayName}</div>
              <div className="truncate text-xs text-ink-2">{user?.email}</div>
            </div>
            <div className="my-1 h-px bg-line-soft" />
            <Link
              href="/account-setting"
              role="menuitem"
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-ink-0 hover:bg-brand-wash/60"
            >
              <Settings size={15} /> Account settings
            </Link>
            <Link
              href="/company-location"
              role="menuitem"
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-ink-0 hover:bg-brand-wash/60"
            >
              <Building size={15} /> Company &amp; locations
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] text-danger hover:bg-danger/10"
            >
              <LogOut size={15} /> Log out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
