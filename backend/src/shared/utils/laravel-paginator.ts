/**
 * Reproduces Laravel's default `LengthAwarePaginator` JSON shape
 * (`$query->paginate($perPage)` -> `response()->json($paginator)`), which
 * several frozen-contract endpoints return verbatim, no envelope
 * (`reference/openapi.yaml`'s `LaravelPaginator` schema — module 2.2
 * `/protocols` is the first caller; 4.7 fleet-crm-billing's
 * `/billing/invoices` is documented to need the same shape later, hence a
 * shared pure utility now rather than reimplementing it twice, same
 * reasoning as D-0049's `payload-mapper.ts`). Pure, stateless: no
 * Express/DB — the caller supplies the already-resolved base path and
 * query string to preserve on page links.
 */
export interface LaravelPaginatorInput<T> {
  items: T[];
  /** 1-based current page, already clamped by the caller if needed. */
  page: number;
  perPage: number;
  total: number;
  /** Absolute URL up to (not including) the query string, e.g. `https://host/api/protocols`. */
  path: string;
  /** Other query params to preserve on every page link (e.g. `search`, `category`) — `page` is added/overwritten automatically. */
  query?: Record<string, string | number | undefined>;
}

export interface LaravelPaginatorLink {
  url: string | null;
  label: string;
  active: boolean;
}

export interface LaravelPaginatorResponse<T> {
  current_page: number;
  data: T[];
  first_page_url: string;
  from: number | null;
  last_page: number;
  last_page_url: string;
  links: LaravelPaginatorLink[];
  next_page_url: string | null;
  path: string;
  per_page: number;
  prev_page_url: string | null;
  to: number | null;
  total: number;
}

function pageUrl(
  path: string,
  query: Record<string, string | number | undefined> | undefined,
  page: number
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.set(key, String(value));
  }
  params.set('page', String(page));
  return `${path}?${params.toString()}`;
}

/**
 * `ProductController::show()`'s own hand-rolled pagination shape (D-0118)
 * — genuinely different from `LaravelPaginatorResponse` above (no `data`
 * key, `links` is a single `{first,last,prev,next}` object rather than
 * an array of numbered page links, and adds `has_more_pages`). Laravel
 * has no single paginator convention app-wide; this is `show()`'s own,
 * matched exactly rather than reused from the flat shape.
 */
export interface CustomLinksPaginatorResponse {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  from: number | null;
  to: number | null;
  has_more_pages: boolean;
  path: string;
  links: { first: string; last: string; prev: string | null; next: string | null };
}

export function buildCustomLinksPaginator(
  input: Omit<LaravelPaginatorInput<unknown>, 'items'>
): CustomLinksPaginatorResponse {
  const lastPage = Math.max(1, Math.ceil(input.total / input.perPage));
  const page = Math.min(Math.max(1, input.page), lastPage);
  const from = input.total === 0 ? null : (page - 1) * input.perPage + 1;
  const to = input.total === 0 ? null : Math.min(page * input.perPage, input.total);

  return {
    current_page: page,
    per_page: input.perPage,
    total: input.total,
    last_page: lastPage,
    from,
    to,
    has_more_pages: page < lastPage,
    path: input.path,
    links: {
      first: pageUrl(input.path, input.query, 1),
      last: pageUrl(input.path, input.query, lastPage),
      prev: page > 1 ? pageUrl(input.path, input.query, page - 1) : null,
      next: page < lastPage ? pageUrl(input.path, input.query, page + 1) : null,
    },
  };
}

export function buildLaravelPaginator<T>(
  input: LaravelPaginatorInput<T>
): LaravelPaginatorResponse<T> {
  const lastPage = Math.max(1, Math.ceil(input.total / input.perPage));
  const page = Math.min(Math.max(1, input.page), lastPage);
  const from = input.total === 0 ? null : (page - 1) * input.perPage + 1;
  const to = input.total === 0 ? null : Math.min(page * input.perPage, input.total);

  const links: LaravelPaginatorLink[] = [
    {
      url: page > 1 ? pageUrl(input.path, input.query, page - 1) : null,
      label: '&laquo; Previous',
      active: false,
    },
  ];
  for (let p = 1; p <= lastPage; p += 1) {
    links.push({ url: pageUrl(input.path, input.query, p), label: String(p), active: p === page });
  }
  links.push({
    url: page < lastPage ? pageUrl(input.path, input.query, page + 1) : null,
    label: 'Next &raquo;',
    active: false,
  });

  return {
    current_page: page,
    data: input.items,
    first_page_url: pageUrl(input.path, input.query, 1),
    from,
    last_page: lastPage,
    last_page_url: pageUrl(input.path, input.query, lastPage),
    links,
    next_page_url: page < lastPage ? pageUrl(input.path, input.query, page + 1) : null,
    path: input.path,
    per_page: input.perPage,
    prev_page_url: page > 1 ? pageUrl(input.path, input.query, page - 1) : null,
    to,
    total: input.total,
  };
}
