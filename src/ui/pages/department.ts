import { html, nothing } from '@gyral/core';
import { breadcrumbs, type Crumb } from '../catalog/breadcrumbs.js';
import { cardGrid, type ProductCard } from '../catalog/product-card.js';

export interface CategoryLinkView {
  readonly slug: string;
  readonly name: string;
  readonly count: number;
}

export interface DepartmentView {
  readonly department: {
    readonly slug: string;
    readonly name: string;
    readonly description: string;
  };
  readonly categories: readonly CategoryLinkView[];
  readonly topRated: readonly ProductCard[];
  readonly deals: readonly ProductCard[];
}

export const departmentCrumbs = (view: Pick<DepartmentView, 'department'>): Crumb[] => [
  { name: 'Home', path: '/' },
  { name: view.department.name },
];

const products = (n: number) => `${String(n)} product${n === 1 ? '' : 's'}`;

/** Department landing: categories, deals and top-rated products of one department. */
export const departmentPage = (view: DepartmentView) => {
  const { department } = view;
  return html`
    ${breadcrumbs(departmentCrumbs(view))}
    <header class="page-intro">
      <h1>${department.name}</h1>
      ${department.description === '' ? nothing : html`<p>${department.description}</p>`}
    </header>
    <section aria-labelledby="categories-title" class="card-section">
      <h2 id="categories-title">Shop by category</h2>
      <ul class="category-grid">
        ${view.categories.map(
          (c) =>
            html`<li>
              <a href="/c/${department.slug}/${c.slug}">
                <span class="name">${c.name}</span>
                <span class="count">${products(c.count)}</span>
              </a>
            </li>`,
        )}
      </ul>
    </section>
    ${
      view.deals.length === 0
        ? nothing
        : cardGrid(`Deals in ${department.name}`, 'department-deals-title', view.deals, 4)
    }
    ${cardGrid(
      `Top rated in ${department.name}`,
      'department-top-title',
      view.topRated,
      view.deals.length === 0 ? 4 : 0,
    )}
  `;
};
