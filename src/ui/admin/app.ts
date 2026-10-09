// <shop-admin>: the client-rendered admin app (docs/product-specs/admin.md, ARCHITECTURE.md
// render mode `csr`). The server renders this shell for every /admin URL; in the browser the
// router captures in-app links, and each section is its own component that loads its data from
// the admin JSON API. Light DOM (theme contract, ADR 0006 rule 5): document styles apply and
// themes can restyle it through the `admin*` hooks.
import { define, each, focus, html, nothing, prop, type Next } from '@gyral/core';
import { listen, setHead, type RouteLocation } from '@gyral/router';
import { goTo } from '../drivers/location.js';
import { adminDrivers } from './drivers.js';
import { adminHead, adminPageTitle, adminSection, adminView, type AdminView } from './routes.js';
import './dashboard.js';
import './products.js';
import './product-edit.js';
import './orders.js';
import './order-detail.js';
import './promos.js';
import './promo-edit.js';
import './users.js';
import './reviews.js';
import './taxonomy.js';

export interface AdminProps {
  /** Path and query of the admin URL the server rendered (the browser seeds it back). */
  readonly path: string;
}

export interface AdminState {
  readonly url: string;
  /** False until the first in-app navigation: focus moves to the new heading after that. */
  readonly navigated: boolean;
}

export type AdminMsg = { readonly _tag: 'Routed'; readonly location: RouteLocation };

const NAV = [
  ['dashboard', '/admin', 'Dashboard'],
  ['products', '/admin/products', 'Products'],
  ['taxonomy', '/admin/taxonomy', 'Departments & brands'],
  ['orders', '/admin/orders', 'Orders'],
  ['promos', '/admin/promos', 'Promo codes'],
  ['users', '/admin/users', 'Users'],
  ['reviews', '/admin/reviews', 'Reviews'],
] as const;

function section(view: AdminView) {
  switch (view.name) {
    case 'dashboard':
      return html`<shop-admin-dashboard></shop-admin-dashboard>`;
    case 'products':
      return html`<shop-admin-products .search=${view.search}></shop-admin-products>`;
    case 'newProduct':
      return html`<shop-admin-product .productId=${0}></shop-admin-product>`;
    case 'product':
      return html`<shop-admin-product .productId=${view.id}></shop-admin-product>`;
    case 'notFound':
      return html`<section data-region="admin-not-found">
        <h1 tabindex="-1">Not found</h1>
        <p>There is no admin page at this address. <a href="/admin">Go to the dashboard</a>.</p>
      </section>`;
    case 'orders':
      return html`<shop-admin-orders .search=${view.search}></shop-admin-orders>`;
    case 'order':
      return html`<shop-admin-order .number=${view.number}></shop-admin-order>`;
    case 'promos':
      return html`<shop-admin-promos></shop-admin-promos>`;
    case 'newPromo':
      return html`<shop-admin-promo .promoId=${0}></shop-admin-promo>`;
    case 'promo':
      return html`<shop-admin-promo .promoId=${view.id}></shop-admin-promo>`;
    case 'users':
      return html`<shop-admin-users .search=${view.search}></shop-admin-users>`;
    case 'reviews':
      return html`<shop-admin-reviews .search=${view.search}></shop-admin-reviews>`;
    case 'taxonomy':
      return html`<shop-admin-taxonomy></shop-admin-taxonomy>`;
  }
}

function routed(s: AdminState, location: RouteLocation): Next<AdminState, AdminMsg> {
  // Captured links outside the admin (header, footer) are full page loads.
  if (!location.pathname.startsWith('/admin')) return [s, [goTo(location.href)]];
  const url = location.pathname + location.search;
  const head = setHead(adminHead(adminPageTitle(url)));
  if (url === s.url) return [s, [head]];
  return [{ url, navigated: true }, [head, focus('h1', { preventScroll: false })]];
}

export const AdminApp = define<AdminState, AdminMsg, AdminProps>()('shop-admin', {
  shadow: false,
  props: { path: prop.string({ required: true }) },
  init: (props) => [
    { url: props.path, navigated: false },
    [listen((location): AdminMsg => ({ _tag: 'Routed', location }))],
  ],
  intent: {},
  update: { Routed: (s, m) => routed(s, m.location) },
  drivers: adminDrivers,
  view: (s) => {
    const view = adminView(s.url);
    const current = adminSection(view);
    // A product or order view starts fresh when its id changes (new data, new form state):
    // a one-row keyed list whose key is the view's identity.
    const key =
      view.name === 'product'
        ? `p${String(view.id)}`
        : view.name === 'order'
          ? `o${view.number}`
          : view.name === 'promo'
            ? `c${String(view.id)}`
            : view.name;
    return html`<div class="admin" data-region="admin">
      <nav class="admin-nav" aria-label="Admin" data-region="admin-nav">
        <p class="admin-brand">Store admin</p>
        <ul>
          ${NAV.map(
            ([name, href, label]) =>
              html`<li>
                <a href=${href} aria-current=${current === name ? 'page' : nothing}>${label}</a>
              </li>`,
          )}
        </ul>
      </nav>
      <div class="admin-main" data-region="admin-main">
        ${each(
          [key],
          (k) => k,
          (_k, v: AdminView) => section(v),
          () => view,
        )}
      </div>
    </div>`;
  },
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-admin': InstanceType<typeof AdminApp>;
  }
}
