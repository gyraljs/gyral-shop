// <shop-admin-dashboard>: sales, orders by status, low stock, best sellers and consented page
// views (docs/product-specs/admin.md, "Dashboard"). Loads GET /api/admin/dashboard on start.
import { define, html, nothing } from '@gyral/core';
import { get, type HttpError } from '@gyral/http';
import { DashboardSchema, type Dashboard } from '../../domain/admin.js';
import { format, usd } from '../../domain/money.js';
import { adminDrivers } from './drivers.js';
import { loadError, statusLabel } from './format.js';

export interface DashboardState {
  readonly data: Dashboard | null;
  readonly error: string | null;
}

export type DashboardMsg =
  | { readonly _tag: 'Loaded'; readonly data: Dashboard }
  | { readonly _tag: 'Failed'; readonly error: HttpError };

export const loadDashboard = () =>
  get('/api/admin/dashboard', {
    schema: DashboardSchema,
    onSuccess: (data): DashboardMsg => ({ _tag: 'Loaded', data }),
    onFailure: (error): DashboardMsg => ({ _tag: 'Failed', error }),
    key: 'admin-dashboard',
    concurrency: 'switch',
  });

const money = (cents: number) => format(usd(cents));

function salesTile(label: string, sales: Dashboard['sales']['today']) {
  return html`<div data-component="stat">
    <dt>${label}</dt>
    <dd>
      <data value=${sales.cents}>${money(sales.cents)}</data>
      <small>${sales.orders} ${sales.orders === 1 ? 'order' : 'orders'}</small>
    </dd>
  </div>`;
}

function body(d: Dashboard) {
  return html`
    <section aria-labelledby="sales-heading" data-region="admin-sales">
      <h2 id="sales-heading">Sales</h2>
      <p class="hint" data-component="time-zone">
        Days start at midnight, ${d.timeZone.replaceAll('_', ' ')} time.
      </p>
      <dl class="admin-stats">
        ${salesTile('Today', d.sales.today)} ${salesTile('Last 7 days', d.sales.week)}
        ${salesTile('Last 30 days', d.sales.month)}
      </dl>
    </section>
    <section aria-labelledby="status-heading" data-region="admin-orders-by-status">
      <h2 id="status-heading">Orders by status</h2>
      ${
        d.byStatus.length === 0
          ? html`<p data-component="empty">No orders yet.</p>`
          : html`<ul class="admin-status-list">
              ${d.byStatus.map(
                (row) =>
                  html`<li>
                    <a href=${`/admin/orders?status=${row.status}`}>${statusLabel(row.status)}</a>
                    <data value=${row.count}>${row.count}</data>
                  </li>`,
              )}
            </ul>`
      }
    </section>
    <section aria-labelledby="low-heading" data-region="admin-low-stock">
      <h2 id="low-heading">Low stock</h2>
      ${
        d.lowStock.length === 0
          ? html`<p data-component="empty">Every SKU has more than 5 units.</p>`
          : html`<table class="admin-table" data-component="admin-table">
              <thead>
                <tr>
                  <th scope="col">SKU</th>
                  <th scope="col">Product</th>
                  <th scope="col" class="num">Stock</th>
                </tr>
              </thead>
              <tbody>
                ${d.lowStock.map(
                  (row) =>
                    html`<tr>
                      <td><code>${row.sku}</code></td>
                      <td>
                        <a href=${`/admin/products/${String(row.productId)}`}>${row.product}</a>
                        ${row.label === '' ? nothing : html`<small>${row.label}</small>`}
                      </td>
                      <td class="num" data-stock=${row.stock === 0 ? 'out' : 'low'}>
                        ${row.stock}
                      </td>
                    </tr>`,
                )}
              </tbody>
            </table>`
      }
    </section>
    <section aria-labelledby="top-heading" data-region="admin-top-products">
      <h2 id="top-heading">Best sellers, last 30 days</h2>
      ${
        d.topProducts.length === 0
          ? html`<p data-component="empty">No sales in the last 30 days.</p>`
          : html`<ol class="admin-top-list">
              ${d.topProducts.map(
                (row) =>
                  html`<li>
                    <a href=${`/admin/products/${String(row.productId)}`}>${row.name}</a>
                    <span>${row.units} sold · ${money(row.cents)}</span>
                  </li>`,
              )}
            </ol>`
      }
    </section>
    <section aria-labelledby="traffic-heading" data-region="admin-traffic">
      <h2 id="traffic-heading">Traffic (consented visitors)</h2>
      <dl class="admin-stats">
        <div data-component="stat">
          <dt>Page views, 7 days</dt>
          <dd><data value=${d.pageViews.week}>${d.pageViews.week}</data></dd>
        </div>
        <div data-component="stat">
          <dt>Page views, 30 days</dt>
          <dd><data value=${d.pageViews.month}>${d.pageViews.month}</data></dd>
        </div>
        <div data-component="stat">
          <dt>Add to cart, 30 days</dt>
          <dd><data value=${d.addToCart.month}>${d.addToCart.month}</data></dd>
        </div>
      </dl>
    </section>
  `;
}

export const AdminDashboard = define<DashboardState, DashboardMsg>()('shop-admin-dashboard', {
  shadow: false,
  init: () => [{ data: null, error: null }, [loadDashboard()]],
  intent: {},
  update: {
    Loaded: (_s, m) => ({ data: m.data, error: null }),
    Failed: (s, m) => ({ ...s, error: loadError(m.error) }),
  },
  drivers: adminDrivers,
  states: (s) => ({ loading: s.data === null && s.error === null }),
  view: (s) =>
    html`<section class="admin-page" data-region="admin-dashboard">
      <h1 tabindex="-1">Dashboard</h1>
      ${
        s.error === null
          ? nothing
          : html`<p role="alert" data-component="notice" data-kind="error">${s.error}</p>`
      }
      ${
        s.data === null
          ? s.error === null
            ? html`<p role="status" data-component="loading">Loading…</p>`
            : nothing
          : body(s.data)
      }
    </section>`,
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-admin-dashboard': InstanceType<typeof AdminDashboard>;
  }
}
