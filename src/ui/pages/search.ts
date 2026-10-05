// Search pages (docs/product-specs/search.md): results reuse <shop-listing>; an empty query
// or a query with no matches gets a page that points somewhere useful.
import { html } from '@gyral/core';
import type { ListingState } from '../../domain/listing.js';
import { searchQueryString } from '../../domain/search.js';
import '../catalog/listing.js'; // registers <shop-listing> (server render and hydration)
import { listingHref, type BrandOption, type ListingView } from '../catalog/listing-view.js';
import { cardGrid, type ProductCard } from '../catalog/product-card.js';

export const SEARCH_PATH = '/search';

export interface DepartmentLinkView {
  readonly slug: string;
  readonly name: string;
}

export interface SearchSuggestionsView {
  readonly departments: readonly DepartmentLinkView[];
  readonly popular: readonly ProductCard[];
}

export interface SearchResultsView {
  readonly q: string;
  readonly cards: readonly ProductCard[];
  readonly pageCount: number;
  readonly total: number;
  readonly state: ListingState;
  readonly brands: readonly BrandOption[];
}

/** The heading and title of a results page: Results for “q”. */
export const resultsHeading = (q: string): string => `Results for “${q}”`;

/** The URL of a search (canonical spelling), optionally with a listing state. */
export const searchPath = (q: string, state: Partial<ListingState> = {}): string =>
  listingHref({ basePath: SEARCH_PATH, fixedQuery: searchQueryString(q) }, state);

/** The listing component's data for a results page (also the JSON endpoint's body). */
export const searchListing = (view: SearchResultsView): ListingView => ({
  basePath: SEARCH_PATH,
  api: `/api/listing${SEARCH_PATH}`,
  fixedQuery: searchQueryString(view.q),
  heading: resultsHeading(view.q),
  context: '',
  relevanceLabel: 'Best match',
  state: view.state,
  cards: view.cards,
  total: view.total,
  pageCount: view.pageCount,
  brands: view.brands,
});

const departmentLinks = (departments: readonly DepartmentLinkView[]) => html`
  <section
    data-region="search-departments"
    aria-labelledby="search-departments-title"
    class="card-section"
  >
    <h2 id="search-departments-title">Browse departments</h2>
    <ul class="category-grid">
      ${departments.map(
        (d) =>
          html`<li>
            <a href="/d/${d.slug}"><span class="name">${d.name}</span></a>
          </li>`,
      )}
    </ul>
  </section>
`;

const suggestionsBlock = (suggestions: SearchSuggestionsView) => html`
  ${departmentLinks(suggestions.departments)}
  ${
    suggestions.popular.length === 0
      ? ''
      : cardGrid('Popular right now', 'search-popular-title', suggestions.popular)
  }
`;

/** `/search` without a query: ask for one, and offer departments. */
export const searchPrompt = (suggestions: SearchSuggestionsView) => html`
  <header class="page-intro" data-region="page-intro">
    <h1>Search</h1>
    <p>Type what you’re looking for in the search box above: a product, a brand or a category.</p>
  </header>
  ${suggestionsBlock(suggestions)}
`;

/** A query that matched nothing (search spec: "no results" page). */
export const noResults = (q: string, suggestions: SearchSuggestionsView) => html`
  <header class="page-intro" data-region="page-intro">
    <h1>${resultsHeading(q)}</h1>
    <p role="status">No products match “${q}”.</p>
    <p>Check the spelling, try fewer or more general words, or browse a department.</p>
  </header>
  ${suggestionsBlock(suggestions)}
`;

/** Search results: the listing component (filters, sort, pagination) for a query. */
export const searchResults = (view: SearchResultsView) =>
  html`<shop-listing .view=${searchListing(view)}></shop-listing>`;
