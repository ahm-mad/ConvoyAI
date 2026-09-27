'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Search,
  Settings,
  Sparkles,
  Building,
  Plug,
  Boxes,
  CreditCard,
  Route as RouteIcon,
  Wrench,
  X,
} from 'lucide-react';
import { useUser } from '@contexts/UserContext';
import { disconnectSocket } from '@contexts/SocketContext';
import { isShowcase, setShowcase } from '@utils/showcase';
import { buildNav, type NavGroup } from './nav-config';
import BrandMark from './BrandMark';
import WorkspaceChip from './WorkspaceChip';

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
  const [showcaseOn, setShowcaseOn] = useState(false);

  useEffect(() => setShowcaseOn(isShowcase()), []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unread, setUnread] = useState(true);
  const rootRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [hl, setHl] = useState<{ left: number; width: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const groups = buildNav({ isSuperAdmin, isDemo: user?.isDemo, hasPermission });

  useEffect(() => {
    setOpen(null);
    setUserMenu(false);
    setMobileOpen(false);
    setNotifOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(null);
        setUserMenu(false);
        setMobileOpen(false);
        setNotifOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(null);
        setUserMenu(false);
        setMobileOpen(false);
        setNotifOpen(false);
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
    setNotifOpen(false);
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
      <Link href="/fleet-management/operations/overview" className="pr-2">
        <BrandMark />
      </Link>
      <WorkspaceChip />

      <ul
        ref={listRef}
        className="relative ml-1 hidden items-center gap-0.5 lg:flex"
        onMouseLeave={() => setHl(null)}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 rounded-full bg-brand-wash/70 transition-[left,width,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{ left: hl?.left ?? 0, width: hl?.width ?? 0, opacity: hl ? 1 : 0 }}
        />
        {groups.map(g => {
          const active = isActive(g);
          const Icon = g.icon;
          const hasMenu = g.items.length > 0;
          const base =
            'flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[13.5px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand';
          const tone = active
            ? 'bg-ink-0 text-white'
            : open === g.key
              ? 'text-ink-0'
              : 'text-ink-1';

          return (
            <li
              key={g.key}
              className="relative"
              onMouseEnter={e => {
                setHl({ left: e.currentTarget.offsetLeft, width: e.currentTarget.offsetWidth });
                if (hasMenu) hoverOpen(g.key);
              }}
              onMouseLeave={hoverClose}
            >
              {hasMenu ? (
                <button
                  type="button"
                  className={`${base} ${tone}`}
                  aria-haspopup="menu"
                  aria-expanded={open === g.key}
                  onClick={() => {
                    setUserMenu(false);
                    setNotifOpen(false);
                    setOpen(open === g.key ? null : g.key);
                  }}
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
                  className="glass-menu absolute left-0 top-[calc(100%+12px)] w-[380px] rounded-panel p-2.5"
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
                          <span className="grid size-9 place-items-center rounded-xl bg-brand-wash text-brand icon-gradient transition-transform group-hover:scale-105">
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
        className="hidden shrink-0 items-center gap-2.5 rounded-full bg-black/[0.05] px-3 py-2 text-[13px] text-ink-2 transition-colors hover:bg-black/[0.08] md:flex min-[1720px]:min-w-[210px] min-[1720px]:px-3.5"
        aria-label="Open command palette"
      >
        <Search size={15} />
        <span className="hidden min-[1720px]:inline">Search fleet</span>
        <kbd className="ml-auto hidden min-[1720px]:inline rounded-md border border-line bg-white px-1.5 py-px font-mono text-[11px] text-ink-1">
          ⌘K
        </kbd>
      </button>

      <button
        type="button"
        onClick={onOpenCopilot}
        className="btn-ai flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold"
      >
        <Sparkles size={15} fill="currentColor" />
        <span className="hidden whitespace-nowrap sm:inline">Ask Convoy</span>
      </button>

      <div className="relative">
        <button
          type="button"
          aria-label="Notifications"
          aria-expanded={notifOpen}
          onClick={() => {
            setOpen(null);
            setUserMenu(false);
            setNotifOpen(v => !v);
          }}
          className="bell-wiggle relative grid size-[38px] shrink-0 place-items-center rounded-full border border-line bg-white text-ink-1 transition-colors hover:bg-surface-2"
        >
          <Bell size={16} />
          {unread && (
            <span className="absolute right-2 top-2 size-2 rounded-full border-2 border-white bg-gold icon-live-dot" />
          )}
        </button>
        {notifOpen && (
          <div
            role="menu"
            className="glass-menu absolute right-0 top-[calc(100%+12px)] w-[340px] max-w-[calc(100vw-32px)] rounded-panel p-2"
          >
            <div className="flex items-center justify-between px-3 pb-2 pt-2.5">
              <span className="card-title">Notifications</span>
              <button
                type="button"
                onClick={() => setUnread(false)}
                className="text-caption font-semibold text-brand hover:underline"
              >
                Mark all read
              </button>
            </div>
            {[
              {
                icon: AlertTriangle,
                tone: 'bg-danger/10 text-danger-text',
                title: 'Harsh braking on KHI-0764',
                text: '3 events in the last hour',
                time: '4 min',
              },
              {
                icon: Wrench,
                tone: 'bg-gold-wash text-gold-ink',
                title: 'Service due in 9 days',
                text: 'LHE-1180 brake inspection',
                time: '1 h',
              },
              {
                icon: RouteIcon,
                tone: 'bg-brand-wash text-brand icon-gradient',
                title: 'Trip T-48213 completed',
                text: 'Delivered 12 min early',
                time: '3 h',
              },
              {
                icon: Sparkles,
                tone: 'bg-ai-wash text-ai-ink',
                title: 'AI found savings this week',
                text: 'Review 3 suggestions',
                time: 'Today',
              },
            ].map(n => {
              const I = n.icon;
              return (
                <div
                  key={n.title}
                  className={`flex items-start gap-3 rounded-card px-3 py-2.5 hover:bg-black/[0.04] ${unread ? '' : 'opacity-70'}`}
                >
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-control ${n.tone}`}
                  >
                    <I size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-control font-semibold text-ink-0">{n.title}</span>
                    <span className="block text-caption text-ink-2">{n.text}</span>
                  </span>
                  <span className="shrink-0 text-micro text-ink-2">{n.time}</span>
                </div>
              );
            })}
            <Link
              href="/notifications"
              onClick={() => setNotifOpen(false)}
              className="mt-1 block rounded-card px-3 py-2 text-center text-xs font-medium text-brand-ink hover:bg-brand-wash/60"
            >
              View all notifications
            </Link>
          </div>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setOpen(null);
            setNotifOpen(false);
            setUserMenu(v => !v);
          }}
          aria-haspopup="menu"
          aria-expanded={userMenu}
          aria-label="Account menu"
          className="grid size-[38px] shrink-0 place-items-center overflow-hidden rounded-full border-2 border-white text-[13px] font-semibold text-white shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
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
            className="glass-menu absolute right-0 top-[calc(100%+12px)] w-64 rounded-panel p-2"
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
            <Link
              href="/integration"
              role="menuitem"
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-ink-0 hover:bg-brand-wash/60"
            >
              <Plug size={15} /> Integrations
            </Link>
            <Link
              href="/module-management"
              role="menuitem"
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-ink-0 hover:bg-brand-wash/60"
            >
              <Boxes size={15} /> Modules
            </Link>
            <Link
              href="/plan-management"
              role="menuitem"
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-ink-0 hover:bg-brand-wash/60"
            >
              <CreditCard size={15} /> Plan &amp; usage
            </Link>
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={showcaseOn}
              onClick={() => {
                setShowcase(!showcaseOn);
                window.location.reload();
              }}
              className="flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] text-ink-0 hover:bg-brand-wash/60"
            >
              <span className="flex items-center gap-2.5">
                <Sparkles size={15} /> Showcase data
              </span>
              <span className={`status-dot ${showcaseOn ? 'status-dot--ok' : ''}`} aria-hidden />
              <span className="sr-only">{showcaseOn ? 'On' : 'Off'}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] text-danger-text hover:bg-danger/10"
            >
              <LogOut size={15} /> Log out
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileOpen}
        onClick={() => {
          setOpen(null);
          setUserMenu(false);
          setMobileOpen(v => !v);
        }}
        className="grid size-[38px] shrink-0 place-items-center rounded-full border border-line bg-white text-ink-1 lg:hidden"
      >
        {mobileOpen ? <X size={17} /> : <Menu size={17} />}
      </button>

      {mobileOpen && (
        <div
          role="menu"
          className="glass-menu absolute left-0 right-0 top-[calc(100%+12px)] max-h-[calc(100vh-110px)] overflow-y-auto rounded-panel p-3 lg:hidden"
        >
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              onOpenPalette();
            }}
            className="mb-2 flex w-full items-center gap-2.5 rounded-full bg-black/[0.05] px-4 py-3 text-control text-ink-2"
          >
            <Search size={15} /> Search fleet
          </button>
          {groups.map(g => {
            const Icon = g.icon;

            return g.items.length ? (
              <div key={g.key} className="py-1">
                <div className="eyebrow flex items-center gap-2 px-3 py-2">
                  <Icon size={13} /> {g.label}
                </div>
                {g.items.map(item => {
                  const ItemIcon = item.icon;
                  const here = pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      role="menuitem"
                      className={`flex items-center gap-3 rounded-card px-3 py-2.5 text-control font-medium text-ink-0 ${here ? 'bg-brand-wash' : 'hover:bg-black/[0.05]'}`}
                    >
                      <span className="grid size-8 place-items-center rounded-control bg-brand-wash text-brand icon-gradient">
                        <ItemIcon size={15} />
                      </span>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ) : (
              <Link
                key={g.key}
                href={g.href ?? '#'}
                role="menuitem"
                className={`flex items-center gap-3 rounded-card px-3 py-3 text-control font-semibold text-ink-0 ${isActive(g) ? 'bg-brand-wash' : 'hover:bg-black/[0.05]'}`}
              >
                <span className="grid size-8 place-items-center rounded-control bg-brand-wash text-brand icon-gradient">
                  <Icon size={15} />
                </span>
                {g.label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
