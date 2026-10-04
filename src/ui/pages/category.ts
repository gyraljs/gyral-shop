import { html, nothing } from '@gyral/core';
import { listingSearch, pageRange } from '../../domain/listing.js';
import { breadcrumbs, type Crumb } from '../catalog/breadcrumbs.js';
import { pager } from '../catalog/pager.js';
import { productCard, type ProductCard } from '../catalog/product-card.js';
import type { CategoryLinkView } from './department.js';

export interface CategoryView {
  readonly department: { readonly slug: string; readonly name: string };
  readonly category: { readonly slug: string; readonly name: string };
  readonly categories: readonly CategoryLinkView[];
  readonly cards: readonly ProductCard[];
  readonly page: number;
  readonly pageCount: number;
  readonly total: number;
}

/** The URL of a category listing page (canonical spelling). */
export const categoryPath = (department: string, category: string, page = 1): string =>
  `/c/${department}/${category}${listingSearch({ page })}`;

export const categoryCrumbs = (view: Pick<CategoryView, 'department' | 'category'>): Crumb[] => [
  { name: 'Home', path: '/' },
  { name: view.department.name, path: `/d/${view.department.slug}` },
  { name: view.category.name },
];

const summary = (view: CategoryView) => {
  const { first, last, total } = pageRange(view.page, view.total);
  if (total === 0) return 'No products';
  return `Showing ${String(first)}–${String(last)} of ${String(total)} product${total === 1 ? '' : 's'}`;
};

/** A category listing: department side navigation, one page of product cards, a pager. */
export const categoryPage = (view: CategoryView) => {
  const { department, category } = view;
  return html`
    ${breadcrumbs(categoryCrumbs(view))}
    <div class="listing">
      <aside class="listing-nav" aria-labelledby="listing-nav-title">
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
      </aside>
      <section class="listing-results" aria-labelledby="listing-title">
        <header class="listing-header">
          <h1 id="listing-title">
            ${category.name}${
              view.page > 1
                ? html`<span class="visually-hidden">, page ${view.page}</span>`
                : nothing
            }
          </h1>
          <p class="result-count">${summary(view)}</p>
        </header>
        <h2 class="visually-hidden">Products</h2>
        ${
          view.cards.length === 0
            ? html`<p class="empty">
                There are no products here yet. Try another
                <a href="/d/${department.slug}">${department.name}</a> category.
              </p>`
            : html`<div class="card-grid">
                ${view.cards.map((card, i) => productCard(card, view.page === 1 && i < 4))}
              </div>`
        }
        ${pager({
          page: view.page,
          pageCount: view.pageCount,
          href: (page) => categoryPath(department.slug, category.slug, page),
        })}
      </section>
    </div>
  `;
};
