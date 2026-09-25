'use client';

import { forwardRef, useCallback, useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import NextLink from 'next/link';
import {
  useRouter as useNextRouter,
  usePathname,
  useSearchParams as useNextSearchParams,
  useParams,
} from 'next/navigation';

/**
 * react-router-dom -> next/navigation compatibility shim.
 *
 * The Vite SPA had ~55 react-router call sites. Instead of rewriting each one,
 * the Next migration swaps only the import source ('react-router-dom' ->
 * '@lib/router-compat'). This module reimplements the exact subset the codebase
 * uses (see task.md Phase 2): useNavigate, useLocation, useParams,
 * useSearchParams, <Link>, <NavLink>, <Navigate>.
 *
 * Caveat: react-router's ephemeral `navigate(to, { state })` has no App Router
 * equivalent. We bridge the "navigate, then read the state once on the next
 * screen" pattern (the only pattern this app uses) through a single-slot
 * sessionStorage stash that useLocation().state consumes. Multi-hop history of
 * router state and back/forward state restoration are NOT preserved.
 */

const STATE_KEY = '__convoyai_router_state__';

type NavigateOptions = {
  replace?: boolean;
  state?: unknown;
  preventScrollReset?: boolean;
};

function stashState(state: unknown): void {
  try {
    if (state === undefined || state === null) sessionStorage.removeItem(STATE_KEY);
    else sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* sessionStorage unavailable (private mode / SSR) */
  }
}

function readState(): unknown {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Used by app/(app)/layout.tsx to pass `{ from }` to /login, the same way
// react-router's <Navigate state={{ from }} /> did.
export function setRouterState(state: unknown): void {
  stashState(state);
}

// next/navigation's useParams is shape-compatible with react-router's for the
// dynamic-segment names this app uses (:id -> [id], :productId -> [productId], ...).
export { useParams };

export function useNavigate() {
  const router = useNextRouter();
  return useCallback(
    (to: string | number, options: NavigateOptions = {}) => {
      if (typeof to === 'number') {
        if (to < 0) router.back();
        else router.forward();
        return;
      }
      stashState(options.state);
      const scroll = !options.preventScrollReset;
      if (options.replace) router.replace(to, { scroll });
      else router.push(to, { scroll });
    },
    [router]
  );
}

export interface CompatLocation {
  pathname: string;
  search: string;
  hash: string;
  // `state` is whatever the previous screen stashed — inherently dynamic, and
  // the migration is not typing navigation payloads. Kept `any` on purpose.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any;
  key: string;
}

export function useLocation(): CompatLocation {
  const pathname = usePathname();
  const searchParams = useNextSearchParams();
  const search = searchParams && searchParams.toString() ? `?${searchParams.toString()}` : '';
  return {
    pathname: pathname || '/',
    search,
    hash: typeof window !== 'undefined' ? window.location.hash : '',
    state: readState(),
    key: 'default',
  };
}

type SetSearchParamsInit =
  string | URLSearchParams | Record<string, string> | ((prev: URLSearchParams) => URLSearchParams);

// react-router returns [params, setParams]; next returns just the params object.
export function useSearchParams(): [
  ReturnType<typeof useNextSearchParams>,
  (init: SetSearchParamsInit, opts?: { replace?: boolean }) => void,
] {
  const searchParams = useNextSearchParams();
  const router = useNextRouter();
  const pathname = usePathname();

  const setSearchParams = useCallback(
    (nextInit: SetSearchParamsInit, navigateOptions: { replace?: boolean } = {}) => {
      const current = new URLSearchParams(searchParams ? searchParams.toString() : '');
      const next =
        typeof nextInit === 'function'
          ? nextInit(current)
          : nextInit instanceof URLSearchParams
            ? nextInit
            : new URLSearchParams(nextInit || '');
      const qs = next.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (navigateOptions.replace) router.replace(url);
      else router.push(url);
    },
    [router, pathname, searchParams]
  );

  return [searchParams, setSearchParams];
}

// react-router <Link to>; next/link <Link href>.
type LinkProps = {
  to?: string;
  href?: string;
  replace?: boolean;
  state?: unknown;
  reloadDocument?: boolean;
  preventScrollReset?: boolean;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { to, href, replace, state, reloadDocument, preventScrollReset, onClick, ...rest },
  ref
) {
  const target = to ?? href ?? '#';
  const handleClick =
    state !== undefined
      ? (e: React.MouseEvent<HTMLAnchorElement>) => {
          stashState(state);
          onClick?.(e);
        }
      : onClick;
  return (
    <NextLink
      ref={ref}
      href={target}
      replace={replace}
      scroll={!preventScrollReset}
      onClick={handleClick}
      {...rest}
    />
  );
});

type NavLinkRenderProps = { isActive: boolean; isPending: boolean; isTransitioning: boolean };
type NavLinkProps = {
  to?: string;
  href?: string;
  end?: boolean;
  caseSensitive?: boolean;
  className?: string | ((props: NavLinkRenderProps) => string | undefined);
  style?: CSSProperties | ((props: NavLinkRenderProps) => CSSProperties | undefined);
  children?: ReactNode | ((props: NavLinkRenderProps) => ReactNode);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function NavLink(
  { to, href, end, caseSensitive, className, style, children, ...rest },
  ref
) {
  const pathname = usePathname() || '/';
  const target = String(to ?? href ?? '#');
  const [rawPath] = target.split('?');
  const targetPath = rawPath || '/';

  let isActive: boolean;
  if (targetPath === '/') {
    isActive = pathname === '/';
  } else if (end) {
    isActive = pathname === targetPath;
  } else {
    const base = targetPath.endsWith('/') ? targetPath.slice(0, -1) : targetPath;
    isActive = pathname === base || pathname.startsWith(`${base}/`);
  }

  const renderProps: NavLinkRenderProps = { isActive, isPending: false, isTransitioning: false };
  const resolvedClassName = typeof className === 'function' ? className(renderProps) : className;
  const resolvedStyle = typeof style === 'function' ? style(renderProps) : style;
  const resolvedChildren = typeof children === 'function' ? children(renderProps) : children;

  return (
    <NextLink
      ref={ref}
      href={target}
      className={resolvedClassName}
      style={resolvedStyle}
      aria-current={isActive ? 'page' : undefined}
      {...rest}
    >
      {resolvedChildren}
    </NextLink>
  );
});

export function Navigate({
  to,
  replace = true,
  state,
}: {
  to: string;
  replace?: boolean;
  state?: unknown;
}) {
  const router = useNextRouter();
  useEffect(() => {
    stashState(state);
    if (replace) router.replace(to);
    else router.push(to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, replace]);
  return null;
}
