import { describe, expect, it } from 'vitest';
import {
  listingSearch,
  pageCount,
  pageRange,
  pageWindow,
  parseListing,
  type PageLink,
} from './listing.js';

describe('parseListing', () => {
  it('defaults to the first page', () => {
    expect(parseListing({})).toEqual({ ok: true, value: { page: 1 } });
  });

  it('accepts later pages', () => {
    expect(parseListing({ page: '3' })).toEqual({ ok: true, value: { page: 3 } });
  });

  it('redirects non-canonical or invalid spellings to the canonical state', () => {
    for (const page of ['1', '0', '-2', '01', 'abc', '2.5', '', '999999']) {
      expect(parseListing({ page })).toEqual({
        ok: false,
        error: { _tag: 'Noncanonical', state: { page: 1 } },
      });
    }
  });

  it('round-trips through listingSearch', () => {
    for (const page of [1, 2, 17]) {
      const search = new URLSearchParams(listingSearch({ page }));
      const parsed = parseListing(Object.fromEntries(search));
      expect(parsed).toEqual({ ok: true, value: { page } });
    }
  });
});

describe('listingSearch', () => {
  it('omits defaults', () => {
    expect(listingSearch({ page: 1 })).toBe('');
    expect(listingSearch({ page: 4 })).toBe('?page=4');
  });
});

describe('pagination math', () => {
  it('counts pages, with at least one', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(24)).toBe(1);
    expect(pageCount(25)).toBe(2);
  });

  it('reports the item range shown', () => {
    expect(pageRange(2, 50)).toEqual({ first: 25, last: 48, total: 50 });
    expect(pageRange(3, 50)).toEqual({ first: 49, last: 50, total: 50 });
    expect(pageRange(1, 0)).toEqual({ first: 0, last: 0, total: 0 });
  });

  it('windows page links around the current page', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(5, 10)).toEqual([1, 'gap', 4, 5, 6, 'gap', 10]);
    expect(pageWindow(3, 10)).toEqual([1, 2, 3, 4, 'gap', 10]);
  });

  it('always includes first, last and current, ascending, never hiding a single page', () => {
    for (let count = 1; count <= 30; count += 1) {
      for (let current = 1; current <= count; current += 1) {
        const links = pageWindow(current, count);
        const pages = links.filter((l): l is number => l !== 'gap');
        expect(pages).toContain(1);
        expect(pages).toContain(count);
        expect(pages).toContain(current);
        expect(pages).toEqual([...pages].sort((a, b) => a - b));
        links.forEach((link: PageLink, i) => {
          if (link !== 'gap') return;
          const before = links[i - 1];
          const after = links[i + 1];
          expect(typeof before === 'number' && typeof after === 'number').toBe(true);
          expect((after as number) - (before as number)).toBeGreaterThan(2);
        });
      }
    }
  });
});
