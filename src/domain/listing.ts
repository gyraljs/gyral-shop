// Listing URL state (catalog spec): which page, sort and filters of a category or search
// listing are shown. Every field lives in the query string, so a listing is linkable, works
// without JavaScript (a GET form) and server-renders. One spelling per state: anything else is
// answered with a redirect to the canonical spelling.
import * as v from 'valibot';
import { err, ok, type Result } from './result.js';

export const PAGE_SIZE = 24;

export const SORTS = ['relevance', 'price-asc', 'price-desc', 'rating', 'newest'] as const;
export type SortKey = (typeof SORTS)[number];

export const SORT_LABELS: Readonly<Record<SortKey, string>> = {
  relevance: 'Featured',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  rating: 'Customer rating',
  newest: 'Newest',
};

/** Minimum average ratings a shopper can filter by. */
export const RATINGS = [4, 3, 2, 1] as const;
export type MinRating = (typeof RATINGS)[number];

export interface ListingState {
  /** 1-based page number. */
  readonly page: number;
  readonly sort: SortKey;
  /** Whole dollars, inclusive. `null` when unbounded. */
  readonly minPrice: number | null;
  readonly maxPrice: number | null;
  /** Brand slugs, sorted and unique. Empty means every brand. */
  readonly brands: readonly string[];
  readonly rating: MinRating | null;
  readonly inStock: boolean;
  readonly onSale: boolean;
}

export const DEFAULT_LISTING: ListingState = {
  page: 1,
  sort: 'relevance',
  minPrice: null,
  maxPrice: null,
  brands: [],
  rating: null,
  inStock: false,
  onSale: false,
};

/** How many filters (not sort or page) differ from the defaults: the "N active" badge. */
export function activeFilterCount(state: ListingState): number {
  return (
    (state.minPrice === null ? 0 : 1) +
    (state.maxPrice === null ? 0 : 1) +
    state.brands.length +
    (state.rating === null ? 0 : 1) +
    (state.inStock ? 1 : 0) +
    (state.onSale ? 1 : 0)
  );
}

/** The query string carries a different spelling of a valid state: redirect to `state`. */
export interface Noncanonical {
  readonly _tag: 'Noncanonical';
  readonly state: ListingState;
}

/** Query parameter names, in their canonical order. */
const KEYS = ['sort', 'min', 'max', 'brand', 'rating', 'stock', 'sale', 'page'] as const;
const MAX_BRANDS = 20;

const PageParam = v.pipe(v.string(), v.regex(/^[1-9]\d{0,4}$/), v.transform(Number));
const DollarsParam = v.pipe(v.string(), v.regex(/^(0|[1-9]\d{0,5})$/), v.transform(Number));
const BrandParam = v.pipe(v.string(), v.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/), v.maxLength(60));
const SortParam = v.picklist(SORTS);
const RatingParam = v.pipe(
  v.string(),
  v.transform(Number),
  v.picklist(RATINGS as unknown as MinRating[]),
);

export type ListingQuery = URLSearchParams | Readonly<Record<string, string | undefined>>;

const toParams = (query: ListingQuery): URLSearchParams => {
  if (query instanceof URLSearchParams) return query;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, value);
  return params;
};

const one = <T>(schema: v.GenericSchema<string, T>, raw: string | null): T | null => {
  if (raw === null) return null;
  const parsed = v.safeParse(schema, raw);
  return parsed.success ? parsed.output : null;
};

/** The state a query describes, ignoring values that don't parse (they are dropped). */
function readState(params: URLSearchParams): ListingState {
  let minPrice = one(DollarsParam, params.get('min'));
  let maxPrice = one(DollarsParam, params.get('max'));
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }
  const brands = [
    ...new Set(params.getAll('brand').filter((b) => v.safeParse(BrandParam, b).success)),
  ]
    .sort()
    .slice(0, MAX_BRANDS);
  return {
    page: one(PageParam, params.get('page')) ?? 1,
    sort: one(SortParam, params.get('sort')) ?? 'relevance',
    minPrice,
    maxPrice,
    brands,
    rating: one(RatingParam, params.get('rating')),
    inStock: params.get('stock') === '1',
    onSale: params.get('sale') === '1',
  };
}

/** The canonical query parameters for a state (defaults omitted, stable order). */
export function listingParams(state: Partial<ListingState>): URLSearchParams {
  const s: ListingState = { ...DEFAULT_LISTING, ...state };
  const params = new URLSearchParams();
  if (s.sort !== 'relevance') params.set('sort', s.sort);
  if (s.minPrice !== null) params.set('min', String(s.minPrice));
  if (s.maxPrice !== null) params.set('max', String(s.maxPrice));
  for (const brand of [...new Set(s.brands)].sort()) params.append('brand', brand);
  if (s.rating !== null) params.set('rating', String(s.rating));
  if (s.inStock) params.set('stock', '1');
  if (s.onSale) params.set('sale', '1');
  if (s.page > 1) params.set('page', String(s.page));
  return params;
}

/** The query string for a state (`''` for defaults), in a stable parameter order. */
export function listingSearch(state: Partial<ListingState>): string {
  const query = listingParams(state).toString();
  return query === '' ? '' : `?${query}`;
}

/** Only the listing's own parameters, in the order given (other parameters are left alone). */
const ownParams = (params: URLSearchParams): string => {
  const own = new URLSearchParams();
  for (const [key, value] of params) {
    if ((KEYS as readonly string[]).includes(key)) own.append(key, value);
  }
  return own.toString();
};

/**
 * Parses listing query parameters. Missing parameters mean defaults. A spelling that is valid
 * but not canonical (`?page=1`, `?sort=relevance`, empty form fields, unsorted brands) or
 * unparseable (`?page=abc`) yields the canonical state to redirect to, so each listing state
 * has exactly one URL. Parameters that aren't the listing's (e.g. `utm_source`) are ignored.
 */
export function parseListing(query: ListingQuery): Result<ListingState, Noncanonical> {
  const params = toParams(query);
  const state = readState(params);
  return ownParams(params) === listingParams(state).toString()
    ? ok(state)
    : err({ _tag: 'Noncanonical', state });
}

/** True when sort or any filter differs from the defaults (the page number aside). */
export const isRefined = (state: ListingState): boolean =>
  listingParams({ ...state, page: 1 }).toString() !== '';

/** Same listing state, compared by canonical spelling. */
export const sameListing = (a: ListingState, b: ListingState): boolean =>
  listingParams(a).toString() === listingParams(b).toString();

/** Number of pages for `total` items; an empty listing still has one (empty) page. */
export const pageCount = (total: number, size = PAGE_SIZE): number =>
  Math.max(1, Math.ceil(total / size));

/** Zero-based offset of a page's first item. */
export const pageOffset = (page: number, size = PAGE_SIZE): number => (page - 1) * size;

export type PageLink = number | 'gap';

/**
 * Page numbers to link from a pager: always the first and last page, the current page with
 * `radius` neighbours, and `'gap'` where numbers are skipped. A gap never hides one page.
 */
export function pageWindow(current: number, count: number, radius = 1): PageLink[] {
  const shown = new Set<number>([1, count]);
  for (let p = current - radius; p <= current + radius; p += 1) {
    if (p >= 1 && p <= count) shown.add(p);
  }
  const pages = [...shown].sort((a, b) => a - b);
  const links: PageLink[] = [];
  pages.forEach((p, i) => {
    const previous = pages[i - 1];
    if (previous !== undefined && p - previous === 2) links.push(p - 1);
    else if (previous !== undefined && p - previous > 2) links.push('gap');
    links.push(p);
  });
  return links;
}

/** "Showing 25–48 of 120": the 1-based range of items on a page. */
export function pageRange(page: number, total: number, size = PAGE_SIZE) {
  const first = total === 0 ? 0 : pageOffset(page, size) + 1;
  return { first, last: Math.min(total, page * size), total };
}
