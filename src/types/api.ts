/**
 * Shared API + domain types.
 *
 * Pragmatic-incremental migration: these describe the shapes the frontend
 * already relies on (Laravel response envelope, the user/role/permission model
 * from UserContext, Laravel pagination). Widen/tighten as `.jsx` files convert.
 */

/** Standard success envelope: `{ data, success, message }` (see apiHelper / fakeBackend). */
export interface ApiEnvelope<T = unknown> {
  data?: T;
  success?: boolean;
  message?: string;
}

/** apiHelper's normalised error return (not thrown — returned). */
export interface ApiError {
  error: true;
  message: string;
  /** HTTP status of the failed response (absent for network errors). */
  status?: number;
  /** Laravel-style 422 field errors, keyed by field path (e.g. `planned_yards.0.yard_id`). */
  errors?: Record<string, string[] | string>;
  /** 409 only: who / when the record was last changed (fleet optimistic concurrency). */
  current?: Record<string, unknown>;
}

/**
 * What `get/post/put/del` resolve to.
 *
 * DELIBERATELY LOOSE for now: the common envelope keys are named, but `data`
 * and every other property are `any`, and there is no `ApiError` union to
 * narrow. This is the "API responses stay untyped until we have real API docs"
 * boundary (owner decision, 2026-09-09) — it lets screens be strict-typed for
 * their props/state/handlers without fighting response shapes. Replace with
 * real per-endpoint response types when the API contract is documented.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type ApiResult<T = any> = {
  data?: T;
  success?: boolean;
  message?: string;
  error?: boolean;
  [key: string]: any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Laravel length-aware paginator (wrapInLaravelMockPagination mirrors this). */
export interface LaravelPaginated<T = unknown> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
  [key: string]: unknown;
}

export interface Permission {
  id: number;
  name: string;
  [key: string]: unknown;
}

export interface Role {
  id: number;
  name: string;
  permissions?: Permission[];
  [key: string]: unknown;
}

export interface Company {
  id: number;
  name: string;
  [key: string]: unknown;
}

export interface User {
  id: number;
  email?: string;
  role_type?: string;
  roles?: Role[];
  company_id?: number;
  company?: Company;
  companyInfo?: boolean;
  first_name?: string;
  last_name?: string;
  number?: string;
  profile_image?: string | null;
  locale?: string;
  isDemo?: boolean;
  isFirstLogin?: boolean;
  [key: string]: unknown;
}

export interface LoginResponse extends ApiEnvelope {
  user?: User;
  token?: string;
}
