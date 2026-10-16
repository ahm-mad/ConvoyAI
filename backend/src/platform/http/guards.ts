import type { RequestHandler } from 'express';
import { getRequestContext } from './request-context.js';
import { UnauthenticatedError, ForbiddenError } from '../errors/app-error.js';

/**
 * Auth guards (ARCHITECTURE.md §5) — mirror Laravel's Spatie semantics
 * for the `api` guard, but reading claims already verified onto the
 * request context (request-context.ts), not a per-request DB lookup.
 *
 * Every guard carries a `guardMeta` tag (no runtime effect) so the OpenAPI
 * contract (`platform/openapi/route-introspection.ts`) can derive each
 * route's real auth requirement from the router itself instead of a
 * hand-maintained list that could drift from the code.
 */
export type GuardMeta =
  { kind: 'auth' } | { kind: 'role'; name: string } | { kind: 'permission'; name: string };

type TaggedGuard = RequestHandler & { guardMeta: GuardMeta };

function tag(handler: RequestHandler, guardMeta: GuardMeta): TaggedGuard {
  return Object.assign(handler, { guardMeta });
}

export function readGuardMeta(handler: unknown): GuardMeta | undefined {
  // Controller stand-ins used by the contract tooling answer any property with a function, so check the shape.
  const meta = (handler as { guardMeta?: unknown } | undefined)?.guardMeta;
  return typeof meta === 'object' && meta !== null ? (meta as GuardMeta) : undefined;
}

export const requireAuth: RequestHandler = tag(
  (_req, _res, next) => {
    if (!getRequestContext()) {
      next(new UnauthenticatedError());
      return;
    }
    next();
  },
  { kind: 'auth' }
);

export function requireRole(role: string): RequestHandler {
  return tag(
    (_req, _res, next) => {
      const ctx = getRequestContext();
      if (!ctx) {
        next(new UnauthenticatedError());
        return;
      }
      if (!ctx.roles.includes(role)) {
        next(new ForbiddenError(`Requires role: ${role}`));
        return;
      }
      next();
    },
    { kind: 'role', name: role }
  );
}

export function requirePermission(permission: string): RequestHandler {
  return tag(
    (_req, _res, next) => {
      const ctx = getRequestContext();
      if (!ctx) {
        next(new UnauthenticatedError());
        return;
      }
      if (!ctx.perms.includes(permission)) {
        next(new ForbiddenError(`Requires permission: ${permission}`));
        return;
      }
      next();
    },
    { kind: 'permission', name: permission }
  );
}
