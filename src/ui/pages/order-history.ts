// /account/orders (docs/product-specs/orders.md): a member's orders, newest first, paginated.
// Server-rendered light DOM; theme hooks per docs/design-docs/0006-theming.md.
import { html, nothing } from '@gyral/core';
import { format, type Money } from '../../domain/money.js';
import { iso, longDate, statusBadge, type OrderStatusName } from '../orders/parts.js';

export interface OrderHistoryData {
  readonly orders: readonly {
    readonly number: string;
    readonly status: OrderStatusName;
    readonly placedAt: Date;
    readonly total: Money;
    readonly itemCount: number;
  }[];
  readonly page: number;
  readonly pages: number;
  readonly total: number;
  readonly flash?: { readonly kind: 'success' | 'error'; readonly message: string };
}

const pageHref = (page: number) =>
  page === 1 ? '/account/orders' : `/account/orders?page=${String(page)}`;

const flashNotice = (flash: OrderHistoryData['flash']) =>
  flash === undefined
    ? nothing
    : html`<p class="notice" data-component="notice" data-kind=${flash.kind} role="status">
        ${flash.message}
      </p>`;

export const orderHistoryPage = (d: OrderHistoryData) => html`
  <article class="order-page order-history" data-region="order-history" aria-labelledby="title">
    <header>
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/account">Your account</a></nav>
      <h1 id="title">Your orders</h1>
      ${
        d.total === 0
          ? nothing
          : html`<p>${d.total === 1 ? '1 order' : `${String(d.total)} orders`}, newest first.</p>`
      }
    </header>
    ${flashNotice(d.flash)}
    ${
      d.orders.length === 0
        ? html`<p data-component="empty">
            You haven't placed any orders yet. <a href="/">Start shopping</a>.
          </p>`
        : html`<table class="order-table" data-component="order-table">
            <caption>
              Orders, page ${d.page} of ${d.pages}
            </caption>
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Placed</th>
                <th scope="col">Status</th>
                <th scope="col">Items</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              ${d.orders.map(
                (o) =>
                  html`<tr data-component="order-row">
                    <th scope="row">
                      <a href="/account/orders/${o.number}" data-component="order-number"
                        >${o.number}</a
                      >
                    </th>
                    <td><time datetime=${iso(o.placedAt)}>${longDate.format(o.placedAt)}</time></td>
                    <td>${statusBadge(o.status)}</td>
                    <td>${o.itemCount}</td>
                    <td data-component="price">${format(o.total)}</td>
                  </tr>`,
              )}
            </tbody>
          </table>`
    }
    ${
      d.pages <= 1
        ? nothing
        : html`<nav class="pager" data-component="pager" aria-label="Order pages">
            ${
              d.page > 1
                ? html`<a href=${pageHref(d.page - 1)} rel="prev">Newer orders</a>`
                : nothing
            }
            <span>Page ${d.page} of ${d.pages}</span>
            ${
              d.page < d.pages
                ? html`<a href=${pageHref(d.page + 1)} rel="next">Older orders</a>`
                : nothing
            }
          </nav>`
    }
  </article>
`;
