import { html, nothing } from '@gyral/core';
import { cardGrid, type ProductCard } from '../catalog/product-card.js';

export interface FeaturedDepartmentView {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly image: { readonly url: string; readonly alt: string } | null;
}

export interface HomeView {
  readonly featured: readonly FeaturedDepartmentView[];
  readonly deals: readonly ProductCard[];
  readonly topRated: readonly ProductCard[];
  readonly bestSellers: readonly ProductCard[];
  readonly newArrivals: readonly ProductCard[];
}

const departmentTile = (d: FeaturedDepartmentView) => html`
  <li data-component="department-tile">
    <a href="/d/${d.slug}">
      ${
        d.image === null
          ? nothing
          : html`<img src=${d.image.url} alt="" width="400" height="400" loading="lazy" />`
      }
      <h3>${d.name}</h3>
    </a>
    <p>${d.description}</p>
  </li>
`;

/** Home: hero, featured departments, deals, top rated, best sellers, new arrivals. */
export const homePage = (view: HomeView) => html`
  <section class="hero" aria-labelledby="hero-title" data-region="hero">
    <h1 id="hero-title">Everything you need, all in one place</h1>
    <p>Electronics, home, clothing, toys, groceries and more, with free shipping over $35.</p>
    <p><a class="button" href="#deals-title">Shop today's deals</a></p>
  </section>
  <section aria-labelledby="departments-title" class="card-section" data-region="departments">
    <h2 id="departments-title">Shop by department</h2>
    <ul class="department-grid">
      ${view.featured.map(departmentTile)}
    </ul>
  </section>
  <div data-region="deals">${cardGrid("Today's deals", 'deals-title', view.deals, 4)}</div>
  <div data-region="top-rated">${cardGrid('Top rated', 'top-rated-title', view.topRated)}</div>
  <div data-region="best-sellers">
    ${cardGrid('Best sellers', 'best-sellers-title', view.bestSellers)}
  </div>
  <div data-region="new-arrivals">${cardGrid('New arrivals', 'new-title', view.newArrivals)}</div>
`;
