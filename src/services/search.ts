// Search results (search spec). Plain data, so it can seed components and travel as JSON.
import type { Db } from '../db/client.js';
import { brandFacets, countProducts, listDepartments, productCards } from '../db/repos/catalog.js';
import { ftsMatch } from '../db/repos/search.js';
import {
  isRefined,
  pageCount,
  pageOffset,
  PAGE_SIZE,
  type ListingState,
} from '../domain/listing.js';
import { searchTerms } from '../domain/search.js';
import { toCard, type Card } from './catalog.js';
import {
  listingFilter,
  withSelected,
  type BrandFacet,
  type DepartmentSummary,
} from './departments.js';

/** Where to go when a search finds nothing (search spec: "no results" page). */
export interface SearchSuggestions {
  readonly departments: readonly DepartmentSummary[];
  readonly popular: readonly Card[];
}

export interface SearchPageData {
  readonly q: string;
  readonly cards: readonly Card[];
  readonly page: number;
  readonly pageCount: number;
  readonly total: number;
  readonly state: ListingState;
  readonly brands: readonly BrandFacet[];
  readonly refined: boolean;
  /** Present when nothing matched the query itself (filters aside). */
  readonly suggestions?: SearchSuggestions;
}

export type SearchPageResult =
  | { readonly _tag: 'Found'; readonly data: SearchPageData }
  /** No query: the page asks for one and suggests departments. */
  | { readonly _tag: 'Empty'; readonly suggestions: SearchSuggestions }
  | { readonly _tag: 'OutOfRange'; readonly lastPage: number };

async function suggestions(db: Db): Promise<SearchSuggestions> {
  const [departments, popular] = await Promise.all([
    listDepartments(db),
    productCards(db, { order: 'rating', inStock: true, limit: 8 }),
  ]);
  return {
    departments: departments.map((d) => ({
      slug: d.slug,
      name: d.name,
      description: d.description,
    })),
    popular: popular.map(toCard),
  };
}

/** One page of search results for a canonical query and listing state. */
export async function searchPage(
  db: Db,
  q: string,
  state: ListingState,
): Promise<SearchPageResult> {
  if (q === '') return { _tag: 'Empty', suggestions: await suggestions(db) };
  // Text with no letters or digits (e.g. "***") can't match anything: an empty results page.
  const match = ftsMatch(searchTerms(q));
  const filter = match === undefined ? undefined : { ...listingFilter(state), match };
  const total = filter === undefined ? 0 : await countProducts(db, filter);
  const pages = pageCount(total);
  if (state.page > pages) return { _tag: 'OutOfRange', lastPage: pages };
  const [rows, facets] =
    filter === undefined
      ? [[], []]
      : await Promise.all([
          productCards(db, {
            ...filter,
            order: state.sort,
            limit: PAGE_SIZE,
            offset: pageOffset(state.page),
          }),
          brandFacets(db, filter),
        ]);
  const refined = isRefined(state);
  const unmatched = total === 0 && !refined;
  return {
    _tag: 'Found',
    data: {
      q,
      cards: rows.map(toCard),
      page: state.page,
      pageCount: pages,
      total,
      state,
      brands: withSelected(facets, state.brands),
      refined,
      ...(unmatched ? { suggestions: await suggestions(db) } : {}),
    },
  };
}
