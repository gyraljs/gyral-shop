import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LISTING,
  isRefined,
  listingSearch,
  pageCount,
  pageRange,
  pageWindow,
  parseListing,
  RATINGS,
  sameListing,
  SORTS,
  type ListingState,
  type PageLink,
} from './listing.js';
import { intBetween, prng } from './prng.test-util.js';

const query = (search: string) => new URLSearchParams(search);

describe('parseListing', () => {
  it('defaults to the first page, featured sort, no filters', () => {
    expect(parseListing({})).toEqual({ ok: true, value: DEFAULT_LISTING });
  });

  it('accepts a canonical query', () => {
    const parsed = parseListing(
      query('sort=price-asc&min=10&max=50&brand=acme&brand=zeta&rating=4&stock=1&sale=1&page=3'),
    );
    expect(parsed).toEqual({
      ok: true,
      value: {
        page: 3,
        sort: 'price-asc',
        minPrice: 10,
        maxPrice: 50,
        brands: ['acme', 'zeta'],
        rating: 4,
        inStock: true,
        onSale: true,
      },
    });
  });

  it('redirects non-canonical or invalid page spellings to page 1', () => {
    for (const page of ['1', '0', '-2', '01', 'abc', '2.5', '', '999999']) {
      expect(parseListing({ page })).toEqual({
        ok: false,
        error: { _tag: 'Noncanonical', state: DEFAULT_LISTING },
      });
    }
  });

  it('canonicalizes what a no-JS filter form submits', () => {
    const parsed = parseListing(
      query('sort=relevance&min=&max=40&brand=zeta&brand=acme&brand=acme&rating=&stock=1'),
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(listingSearch(parsed.error.state)).toBe('?max=40&brand=acme&brand=zeta&stock=1');
  });

  it('drops invalid values and swaps a reversed price range', () => {
    const parsed = parseListing(query('sort=cheap&min=90&max=20&brand=Not%20A%20Slug&rating=5'));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.state).toEqual({ ...DEFAULT_LISTING, minPrice: 20, maxPrice: 90 });
  });

  it("ignores parameters that are not the listing's", () => {
    expect(parseListing(query('utm_source=mail&page=2')).ok).toBe(true);
  });
});

/** A random valid state. */
function randomState(next: () => number): ListingState {
  const maybe = <T>(value: T): T | null => (next() < 0.5 ? null : value);
  let minPrice = maybe(intBetween(next, 0, 500));
  let maxPrice = maybe(intBetween(next, 0, 500));
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }
  const brands = [
    ...new Set(
      Array.from(
        { length: intBetween(next, 0, 4) },
        () => `brand-${String(intBetween(next, 1, 9))}`,
      ),
    ),
  ].sort();
  return {
    page: intBetween(next, 1, 40),
    sort: SORTS[intBetween(next, 0, SORTS.length - 1)] ?? 'relevance',
    minPrice,
    maxPrice,
    brands,
    rating: maybe(RATINGS[intBetween(next, 0, RATINGS.length - 1)] ?? 4),
    inStock: next() < 0.5,
    onSale: next() < 0.5,
  };
}

describe('listing URL state (property-style)', () => {
  it('round-trips every valid state through its canonical query string', () => {
    const next = prng(20261004);
    for (let n = 0; n < 500; n += 1) {
      const state = randomState(next);
      expect(parseListing(query(listingSearch(state).slice(1)))).toEqual({
        ok: true,
        value: state,
      });
    }
  });

  it('maps any query to a canonical state whose own spelling is accepted', () => {
    const next = prng(42);
    const pick = (values: readonly string[]) =>
      values[intBetween(next, 0, values.length - 1)] ?? '';
    for (let n = 0; n < 500; n += 1) {
      const params = new URLSearchParams();
      for (let k = intBetween(next, 0, 8); k > 0; k -= 1) {
        params.append(
          pick(['page', 'sort', 'min', 'max', 'brand', 'rating', 'stock', 'sale', 'other']),
          pick(['', '0', '1', '2', '4', '7', '99', 'abc', 'acme', 'price-desc', 'newest', '-3']),
        );
      }
      const parsed = parseListing(params);
      const state = parsed.ok ? parsed.value : parsed.error.state;
      const again = parseListing(query(listingSearch(state).slice(1)));
      expect(again).toEqual({ ok: true, value: state });
    }
  });
});

describe('listingSearch', () => {
  it('omits defaults', () => {
    expect(listingSearch({ page: 1 })).toBe('');
    expect(listingSearch({ page: 4 })).toBe('?page=4');
    expect(listingSearch({ sort: 'newest', onSale: true })).toBe('?sort=newest&sale=1');
  });

  it('tells refined listings and equal states apart', () => {
    expect(isRefined(DEFAULT_LISTING)).toBe(false);
    expect(isRefined({ ...DEFAULT_LISTING, page: 3 })).toBe(false);
    expect(isRefined({ ...DEFAULT_LISTING, inStock: true })).toBe(true);
    expect(
      sameListing(
        { ...DEFAULT_LISTING, brands: ['a', 'b'] },
        { ...DEFAULT_LISTING, brands: ['b', 'a'] },
      ),
    ).toBe(true);
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
