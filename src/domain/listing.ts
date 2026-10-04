// Listing URL state (catalog spec): which page of a category or search listing is shown.
// Filters and sort join this state in shop-t3l.2; every field lives in the query string so a
// listing is linkable, works without JavaScript and server-renders.
import * as v from 'valibot';
import { err, ok, type Result } from './result.js';

export const PAGE_SIZE = 24;

export interface ListingState {
  /** 1-based page number. */
  readonly page: number;
}

export const FIRST_PAGE: ListingState = { page: 1 };

/** The query string carries a different spelling of a valid state: redirect to `state`. */
export interface Noncanonical {
  readonly _tag: 'Noncanonical';
  readonly state: ListingState;
}

const PageParam = v.pipe(v.string(), v.regex(/^[1-9]\d{0,4}$/), v.transform(Number));

/**
 * Parses listing query parameters. Missing parameters mean defaults. A spelling that is
 * valid but not canonical (`?page=1`) or unparseable (`?page=abc`) yields the canonical state
 * to redirect to, so each listing page has exactly one URL.
 */
export function parseListing(
  params: Readonly<Record<string, string | undefined>>,
): Result<ListingState, Noncanonical> {
  const raw = params['page'];
  if (raw === undefined) return ok(FIRST_PAGE);
  const page = v.safeParse(PageParam, raw);
  if (!page.success || page.output === 1) return err({ _tag: 'Noncanonical', state: FIRST_PAGE });
  return ok({ page: page.output });
}

/** The query string for a state (`''` for defaults), in a stable parameter order. */
export function listingSearch(state: ListingState): string {
  const params = new URLSearchParams();
  if (state.page > 1) params.set('page', String(state.page));
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

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
