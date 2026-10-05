// <shop-admin>: the client-rendered admin app (docs/product-specs/admin.md, ARCHITECTURE.md
// render mode `csr`). The server renders this shell for every /admin URL; in the browser the
// router captures in-app links, and each section is its own component that loads its data from
// the admin JSON API. Light DOM (theme contract, ADR 0006 rule 5): document styles apply and
// themes can restyle it through the `admin*` hooks.
import { define, focus, html, keyed, nothing, type Next } from '@gyral/core';
import { listen, setTitle, type RouteLocation } from '@gyral/router';
import { goTo } from '../drivers/location.js';
import { adminDrivers } from './drivers.js';
import { adminLabel, adminSection, adminTitle, adminView, type AdminView } from './routes.js';
import './dashboard.js';

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
  ['orders', '/admin/orders', 'Orders'],
] as const;

function section(view: AdminView) {
  switch (view.name) {
    case 'dashboard':
      return html`<shop-admin-dashboard></shop-admin-dashboard>`;
    case 'notFound':
      return html`<section data-region="admin-not-found">
        <h1 tabindex="-1">Not found</h1>
        <p>There is no admin page at this address. <a href="/admin">Go to the dashboard</a>.</p>
      </section>`;
    default:
      return html`<section data-region="admin-pending">
        <h1 tabindex="-1">${adminLabel(`/admin/${view.name}`)}</h1>
        <p>This section is not available yet.</p>
      </section>`;
  }
}

function routed(s: AdminState, location: RouteLocation): Next<AdminState, AdminMsg> {
  // Captured links outside the admin (header, footer) are full page loads.
  if (!location.pathname.startsWith('/admin')) return [s, [goTo(location.href)]];
  const url = location.pathname + location.search;
  if (url === s.url) return [s, [setTitle(adminTitle(url))]];
  return [
    { url, navigated: true },
    [setTitle(adminTitle(url)), focus('h1', { preventScroll: false })],
  ];
}

export const AdminApp = define<AdminState, AdminMsg, AdminProps>('shop-admin', {
  shadow: false,
  props: { path: { type: String, required: true } },
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
    // A product or order view starts fresh when its id changes (new data, new form state).
    const key = view.name === 'product' ? `p${String(view.id)}` : view.name;
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
      <div class="admin-main" data-region="admin-main">${keyed(key, section(view))}</div>
    </div>`;
  },
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-admin': InstanceType<typeof AdminApp>;
  }
}
