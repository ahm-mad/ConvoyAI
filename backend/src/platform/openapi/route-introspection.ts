import type { Express } from 'express';
import { createApp } from '../http/app.js';
import { readGuardMeta, type GuardMeta } from '../http/guards.js';

/**
 * Reads the real route table out of the assembled Express app so the
 * OpenAPI contract can be checked against — and its auth requirements
 * derived from — what is actually mounted, not a hand-kept list.
 *
 * The app is built with inert stand-ins for every dependency: nothing here
 * touches a database, Redis or the network, and no handler ever runs.
 */

export interface MountedRoute {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  /** OpenAPI-style path relative to `servers: /api` (e.g. `/products/{product}`). */
  path: string;
  guards: GuardMeta[];
  /** Controller class + handler name behind the route (e.g. `AuthController` / `login`), when it is a plain controller method. */
  handler?: { controller: string; method: string };
}

interface ExpressLayer {
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] };
  name?: string;
  handle?: { stack?: ExpressLayer[] };
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

const LABEL = Symbol('label');

/** A value that can be called, indexed and constructed without doing anything; remembers how it was reached. */
function inert(label: string): unknown {
  const fn = () => undefined;
  return new Proxy(fn, {
    get: (_t, prop) => {
      if (prop === LABEL) return label;
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      return inert(`${label}.${prop}`);
    },
    apply: () => undefined,
  });
}

function handlerOf(handle: unknown): MountedRoute['handler'] {
  const label = (handle as { [LABEL]?: string } | undefined)?.[LABEL];
  const m = label ? /^(\w+Controller)\.(\w+)$/.exec(label) : null;
  return m
    ? { controller: m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1), method: m[2]! }
    : undefined;
}

function toOpenApiPath(expressPath: string): string {
  return expressPath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

export function listMountedRoutes(): MountedRoute[] {
  const deps = new Proxy({}, { get: (_t, prop) => inert(String(prop)) });
  const app = createApp(deps as Parameters<typeof createApp>[0]) as Express & {
    router: { stack: ExpressLayer[] };
  };

  const routes: MountedRoute[] = [];
  const walk = (stack: ExpressLayer[], prefix: string): void => {
    for (const layer of stack) {
      if (layer.route) {
        const guards = layer.route.stack
          .map(l => readGuardMeta(l.handle))
          .filter((g): g is GuardMeta => g !== undefined);
        for (const method of METHODS) {
          if (layer.route.methods[method]) {
            const handler = handlerOf(layer.route.stack[layer.route.stack.length - 1]?.handle);
            routes.push({
              method,
              path: toOpenApiPath(prefix + layer.route.path),
              guards,
              ...(handler ? { handler } : {}),
            });
          }
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
        // Every module router is mounted at `/api`, which is the contract's `servers` entry — strip it.
        walk(layer.handle.stack, prefix);
      }
    }
  };
  walk(app.router.stack, '');

  return routes.filter(
    r => r.path.startsWith('/') && !['/health', '/ready', '/docs/openapi.json'].includes(r.path)
  );
}
