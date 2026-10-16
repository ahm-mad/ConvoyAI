import { describe, expect, it } from 'vitest';
import { buildCustomLinksPaginator, buildLaravelPaginator } from '../laravel-paginator.js';

const PATH = 'https://host/api/protocols';

describe("buildLaravelPaginator (reproduces Laravel's LengthAwarePaginator JSON shape)", () => {
  it('computes from/to/last_page/total for a middle page', () => {
    const result = buildLaravelPaginator({
      items: ['a', 'b'],
      page: 2,
      perPage: 2,
      total: 5,
      path: PATH,
    });

    expect(result).toMatchObject({
      current_page: 2,
      data: ['a', 'b'],
      from: 3,
      to: 4,
      last_page: 3,
      per_page: 2,
      total: 5,
      path: PATH,
    });
  });

  it('first page has a null prev_page_url; last page has a null next_page_url', () => {
    const first = buildLaravelPaginator({ items: [], page: 1, perPage: 10, total: 25, path: PATH });
    const last = buildLaravelPaginator({ items: [], page: 3, perPage: 10, total: 25, path: PATH });

    expect(first.prev_page_url).toBeNull();
    expect(first.next_page_url).toBe(`${PATH}?page=2`);
    expect(last.next_page_url).toBeNull();
    expect(last.prev_page_url).toBe(`${PATH}?page=2`);
  });

  it('from/to are null when there are zero results', () => {
    const result = buildLaravelPaginator({ items: [], page: 1, perPage: 10, total: 0, path: PATH });

    expect(result.from).toBeNull();
    expect(result.to).toBeNull();
    expect(result.last_page).toBe(1);
  });

  it('builds one link per page plus the Previous/Next entries, marking the active page', () => {
    const result = buildLaravelPaginator({
      items: [],
      page: 2,
      perPage: 10,
      total: 25,
      path: PATH,
    });

    expect(result.links).toHaveLength(5); // Previous + 3 pages + Next
    expect(result.links[0]).toMatchObject({ label: '&laquo; Previous', active: false });
    expect(result.links[2]).toMatchObject({ label: '2', active: true, url: `${PATH}?page=2` });
    expect(result.links.at(-1)).toMatchObject({ label: 'Next &raquo;', active: false });
  });

  it('preserves other query params on every page link', () => {
    const result = buildLaravelPaginator({
      items: [],
      page: 1,
      perPage: 10,
      total: 25,
      path: PATH,
      query: { search: 'mqtt', category: 'transport' },
    });

    expect(result.first_page_url).toBe(`${PATH}?search=mqtt&category=transport&page=1`);
    expect(result.next_page_url).toBe(`${PATH}?search=mqtt&category=transport&page=2`);
  });

  it('clamps an out-of-range page to the last page', () => {
    const result = buildLaravelPaginator({
      items: [],
      page: 99,
      perPage: 10,
      total: 25,
      path: PATH,
    });

    expect(result.current_page).toBe(3);
  });
});

describe("buildCustomLinksPaginator (D-0118: ProductController::show()'s own hand-rolled shape)", () => {
  const PRODUCT_PATH = 'https://host/api/products/7';

  it('computes current_page/last_page/from/to/has_more_pages for a single-item first page', () => {
    const result = buildCustomLinksPaginator({
      page: 1,
      perPage: 10,
      total: 1,
      path: PRODUCT_PATH,
    });

    expect(result).toMatchObject({
      current_page: 1,
      per_page: 10,
      total: 1,
      last_page: 1,
      from: 1,
      to: 1,
      has_more_pages: false,
      path: PRODUCT_PATH,
    });
  });

  it("page=0 (the schema's own default, mirroring Laravel's raw input('page', 0)) clamps to page 1, same as Laravel's LengthAwarePaginator", () => {
    const result = buildCustomLinksPaginator({
      page: 0,
      perPage: 10,
      total: 1,
      path: PRODUCT_PATH,
    });

    expect(result.current_page).toBe(1);
    expect(result.from).toBe(1);
  });

  it('has_more_pages is true and next is set on a non-last page; prev is null on the first page', () => {
    const result = buildCustomLinksPaginator({
      page: 1,
      perPage: 10,
      total: 25,
      path: PRODUCT_PATH,
    });

    expect(result.has_more_pages).toBe(true);
    expect(result.links.prev).toBeNull();
    expect(result.links.next).toBe(`${PRODUCT_PATH}?page=2`);
    expect(result.links.first).toBe(`${PRODUCT_PATH}?page=1`);
    expect(result.links.last).toBe(`${PRODUCT_PATH}?page=3`);
  });

  it('last page has has_more_pages:false and a null next link', () => {
    const result = buildCustomLinksPaginator({
      page: 3,
      perPage: 10,
      total: 25,
      path: PRODUCT_PATH,
    });

    expect(result.has_more_pages).toBe(false);
    expect(result.links.next).toBeNull();
    expect(result.links.prev).toBe(`${PRODUCT_PATH}?page=2`);
  });

  it('from/to are null when there are zero results', () => {
    const result = buildCustomLinksPaginator({
      page: 1,
      perPage: 10,
      total: 0,
      path: PRODUCT_PATH,
    });

    expect(result.from).toBeNull();
    expect(result.to).toBeNull();
  });
});
