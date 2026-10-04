import { html } from '@gyral/core';
import { cardGrid, type ProductCard } from '../catalog/product-card.js';
import type { DepartmentLink } from '../layout/site-header.js';

export interface HomeView {
  readonly departments: readonly DepartmentLink[];
  readonly deals: readonly ProductCard[];
  readonly topRated: readonly ProductCard[];
  readonly newArrivals: readonly ProductCard[];
}

/** Home: hero, departments, deals, top rated, new arrivals (content spec). */
export const homePage = (view: HomeView) => html`
  <section class="hero" aria-labelledby="hero-title">
    <h1 id="hero-title">Everything you need, all in one place</h1>
    <p>Electronics, home, clothing, toys, groceries and more, with free shipping over $35.</p>
    <p><a class="button" href="#deals-title">Shop today's deals</a></p>
  </section>
  <section aria-labelledby="departments-title" class="card-section">
    <h2 id="departments-title">Shop by department</h2>
    <ul class="department-grid">
      ${view.departments.map((d) => html`<li><a href="/d/${d.slug}">${d.name}</a></li>`)}
    </ul>
  </section>
  ${cardGrid("Today's deals", 'deals-title', view.deals, 4)}
  ${cardGrid('Top rated', 'top-rated-title', view.topRated)}
  ${cardGrid('New arrivals', 'new-title', view.newArrivals)}
`;
