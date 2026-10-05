// The listing view model: what the server renders a category listing from, and what the JSON
// endpoint returns when the listing updates without a reload. Plain data (JSON-safe) so it
// travels as a component prop, in the hydration seed and over HTTP unchanged.
import * as v from 'valibot';
import {
  listingSearch,
  pageRange,
  RATINGS,
  SORTS,
  type ListingState,
} from '../../domain/listing.js';
import type { ProductCard } from './product-card.js';

export interface BrandOption {
  readonly slug: string;
  readonly name: string;
  readonly count: number;
}

export interface ListingView {
  /** The listing's path without a query, e.g. `/c/electronics/tvs`. */
  readonly basePath: string;
  /** The JSON endpoint for this listing (same query parameters). */
  readonly api: string;
  /** The listing's name (category name), the page heading. */
  readonly heading: string;
  /** Context for the title, e.g. the department name. */
  readonly context: string;
  readonly state: ListingState;
  readonly cards: readonly ProductCard[];
  readonly total: number;
  readonly pageCount: number;
  readonly brands: readonly BrandOption[];
}

/** The URL of a listing state (canonical spelling). */
export const listingHref = (view: Pick<ListingView, 'basePath'>, state: Partial<ListingState>) =>
  `${view.basePath}${listingSearch(state)}`;

/** The page title (without the site name). Server and client use the same function. */
export const listingTitle = (view: ListingView): string =>
  `${view.heading} — ${view.context}${view.state.page > 1 ? ` (page ${String(view.state.page)})` : ''}`;

/** "Showing 25–48 of 120 products", announced politely when results change. */
export function resultSummary(view: Pick<ListingView, 'state' | 'total'>): string {
  const { first, last, total } = pageRange(view.state.page, view.total);
  if (total === 0) return 'No products match';
  return `Showing ${String(first)}–${String(last)} of ${String(total)} product${total === 1 ? '' : 's'}`;
}

// Response decoding at the boundary (AGENTS.md: parse every external input).
const CardSchema = v.object({
  slug: v.string(),
  name: v.string(),
  brand: v.string(),
  priceCents: v.pipe(v.number(), v.integer()),
  salePriceCents: v.nullable(v.pipe(v.number(), v.integer())),
  rating: v.nullable(v.number()),
  ratingCount: v.pipe(v.number(), v.integer()),
  image: v.nullable(v.object({ url: v.string(), alt: v.string() })),
  inStock: v.boolean(),
});

const StateSchema = v.object({
  page: v.pipe(v.number(), v.integer(), v.minValue(1)),
  sort: v.picklist(SORTS),
  minPrice: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  maxPrice: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  brands: v.array(v.string()),
  rating: v.nullable(v.picklist(RATINGS)),
  inStock: v.boolean(),
  onSale: v.boolean(),
});

export const ListingViewSchema = v.object({
  basePath: v.string(),
  api: v.string(),
  heading: v.string(),
  context: v.string(),
  state: StateSchema,
  cards: v.array(CardSchema),
  total: v.pipe(v.number(), v.integer(), v.minValue(0)),
  pageCount: v.pipe(v.number(), v.integer(), v.minValue(1)),
  brands: v.array(
    v.object({ slug: v.string(), name: v.string(), count: v.pipe(v.number(), v.integer()) }),
  ),
}) satisfies v.GenericSchema<unknown, ListingView>;
