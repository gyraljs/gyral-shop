import { html, nothing } from '@gyral/core';
import type { ListingState } from '../../domain/listing.js';
import { breadcrumbs, type Crumb } from '../catalog/breadcrumbs.js';
import '../catalog/listing.js'; // registers <shop-listing> (server render and hydration)
import { listingHref, type BrandOption, type ListingView } from '../catalog/listing-view.js';
import type { ProductCard } from '../catalog/product-card.js';
import type { CategoryLinkView } from './department.js';

export interface CategoryView {
  readonly department: { readonly slug: string; readonly name: string };
  readonly category: { readonly slug: string; readonly name: string };
  readonly categories: readonly CategoryLinkView[];
  readonly cards: readonly ProductCard[];
  readonly page: number;
  readonly pageCount: number;
  readonly total: number;
  readonly state: ListingState;
  readonly brands: readonly BrandOption[];
}

/** The path of a category listing (no query). */
export const categoryBase = (department: string, category: string): string =>
  `/c/${department}/${category}`;

/** The URL of a category listing state (canonical spelling). */
export const categoryPath = (
  department: string,
  category: string,
  state: number | Partial<ListingState> = {},
): string =>
  listingHref(
    { basePath: categoryBase(department, category) },
    typeof state === 'number' ? { page: state } : state,
  );

export const categoryCrumbs = (view: Pick<CategoryView, 'department' | 'category'>): Crumb[] => [
  { name: 'Home', path: '/' },
  { name: view.department.name, path: `/d/${view.department.slug}` },
  { name: view.category.name },
];

/** The listing component's data for a category page (also the JSON endpoint's body). */
export const categoryListing = (view: CategoryView): ListingView => {
  const basePath = categoryBase(view.department.slug, view.category.slug);
  return {
    basePath,
    api: `/api/listing${basePath}`,
    heading: view.category.name,
    context: view.department.name,
    state: view.state,
    cards: view.cards,
    total: view.total,
    pageCount: view.pageCount,
    brands: view.brands,
    crumbs: categoryCrumbs(view),
  };
};

/** A category listing: department side navigation and the listing component. */
export const categoryPage = (view: CategoryView) => {
  const { department, category } = view;
  return html`
    ${breadcrumbs(categoryCrumbs(view))}
    <div class="listing" data-region="category">
      <nav data-region="listing-nav" class="listing-nav" aria-labelledby="listing-nav-title">
        <h2 id="listing-nav-title">
          <a href="/d/${department.slug}">${department.name}</a>
        </h2>
        <ul>
          ${view.categories.map(
            (c) =>
              html`<li>
                <a
                  href=${categoryPath(department.slug, c.slug)}
                  aria-current=${c.slug === category.slug ? 'page' : nothing}
                  >${c.name}</a
                >
              </li>`,
          )}
        </ul>
      </nav>
      <shop-listing .view=${categoryListing(view)}></shop-listing>
    </div>
  `;
};
