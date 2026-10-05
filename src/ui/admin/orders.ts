// <shop-admin-orders>: orders filtered by status, date range and number/email
// (docs/product-specs/admin.md, "Orders"). Filters live in the URL, like the product table.
import { define, form, html, liveBoolean, nothing } from '@gyral/core';
import { get, type HttpError } from '@gyral/http';
import { navigate } from '@gyral/router';
import * as v from 'valibot';
import {
  AdminOrderListSchema,
  ORDER_STATUS_VALUES,
  type AdminOrderList,
  type AdminOrderStatus,
} from '../../domain/admin.js';
import { format, usd } from '../../domain/money.js';
import { statusBadge } from '../orders/parts.js';
import { adminDrivers } from './drivers.js';
import { dateTime, loadError, statusLabel } from './format.js';
import { pager } from './table.js';

export interface OrdersProps {
  readonly search: string;
}

export interface OrdersFilter {
  readonly status: AdminOrderStatus | '';
  readonly from: string;
  readonly to: string;
  readonly q: string;
  readonly page: number;
}

export interface OrdersState {
  readonly search: string;
  readonly list: AdminOrderList | null;
  readonly error: string | null;
}

export type OrdersMsg =
  | { readonly _tag: 'Filter'; readonly filter: Omit<OrdersFilter, 'page'> }
  | { readonly _tag: 'Loaded'; readonly search: string; readonly list: AdminOrderList }
  | { readonly _tag: 'Failed'; readonly error: HttpError };

const isDay = (text: string | null): text is string =>
  text !== null && /^\d{4}-\d{2}-\d{2}$/.test(text);

export function ordersFilter(search: string): OrdersFilter {
  const params = new URLSearchParams(search);
  const page = Number(params.get('page') ?? '1');
  const from = params.get('from');
  const to = params.get('to');
  return {
    status: ORDER_STATUS_VALUES.find((s) => s === params.get('status')) ?? '',
    from: isDay(from) ? from : '',
    to: isDay(to) ? to : '',
    q: (params.get('q') ?? '').trim(),
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function ordersHref(filter: OrdersFilter): string {
  const params = new URLSearchParams();
  for (const key of ['status', 'from', 'to', 'q'] as const) {
    if (filter[key] !== '') params.set(key, filter[key]);
  }
  if (filter.page > 1) params.set('page', String(filter.page));
  const text = params.toString();
  return text === '' ? '/admin/orders' : `/admin/orders?${text}`;
}

const load = (search: string) => {
  const f = ordersFilter(search);
  const params = new URLSearchParams({
    status: f.status,
    from: f.from,
    to: f.to,
    q: f.q,
    page: String(f.page),
  });
  return get(`/api/admin/orders?${params.toString()}`, {
    schema: AdminOrderListSchema,
    onSuccess: (list): OrdersMsg => ({ _tag: 'Loaded', search, list }),
    onFailure: (error): OrdersMsg => ({ _tag: 'Failed', error }),
    key: 'admin-orders',
    concurrency: 'switch',
  });
};

const optionalDay = v.pipe(
  v.optional(v.string(), ''),
  v.check((text) => text === '' || isDay(text), 'Use a date like 2026-10-04.'),
);

const FilterForm = v.object({
  status: v.optional(v.picklist(['', ...ORDER_STATUS_VALUES]), ''),
  from: optionalDay,
  to: optionalDay,
  q: v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(100, 'Use at most 100 characters.')),
});

const money = (cents: number) => format(usd(cents));

function row(o: AdminOrderList['rows'][number]) {
  return html`<tr data-component="order-row">
    <td>
      <a href=${`/admin/orders/${o.number}`}><code>${o.number}</code></a>
    </td>
    <td><time datetime=${o.placedAt}>${dateTime.format(new Date(o.placedAt))}</time></td>
    <td>${o.name}<small>${o.email}</small></td>
    <td>${statusBadge(o.status)}</td>
    <td class="num">${o.items}</td>
    <td class="num">
      ${money(o.totalCents)}
      ${o.refundedCents === 0 ? nothing : html`<small>${money(o.refundedCents)} refunded</small>`}
    </td>
  </tr>`;
}

function filters(f: OrdersFilter, i: { readonly Filter: 'Filter' }) {
  return html`<form
    class="admin-toolbar"
    data-intent=${i.Filter}
    role="search"
    data-component="order-filters"
  >
    <label
      >Status
      <select name="status">
        <option value="" ?selected=${liveBoolean(f.status === '')}>Any status</option>
        ${ORDER_STATUS_VALUES.map(
          (s) =>
            html`<option value=${s} ?selected=${liveBoolean(f.status === s)}>
              ${statusLabel(s)}
            </option>`,
        )}
      </select>
    </label>
    <label>From <input type="date" name="from" .value=${f.from} /></label>
    <label>To <input type="date" name="to" .value=${f.to} /></label>
    <label>Order number or email <input type="search" name="q" .value=${f.q} /></label>
    <button type="submit">Filter</button>
  </form>`;
}

export const AdminOrders = define<OrdersState, OrdersMsg, OrdersProps>('shop-admin-orders', {
  shadow: false,
  props: { search: { type: String, default: '' } },
  init: (props) => [{ search: props.search, list: null, error: null }, [load(props.search)]],
  intent: {
    Filter: form(FilterForm, (data) => ({ _tag: 'Filter', filter: data })),
  },
  update: {
    Filter: (s, m) => [s, [navigate(ordersHref({ ...m.filter, page: 1 }))]],
    Loaded: (s, m) => (m.search === s.search ? { ...s, list: m.list, error: null } : s),
    Failed: (s, m) => ({ ...s, error: loadError(m.error) }),
    PropsChanged: (s, m) =>
      m.props.search === s.search ? s : [{ ...s, search: m.props.search }, [load(m.props.search)]],
  },
  drivers: adminDrivers,
  view: (s, i) => {
    const f = ordersFilter(s.search);
    return html`<section class="admin-page" data-region="admin-orders">
      <h1 tabindex="-1">Orders</h1>
      ${filters(f, i)}
      ${s.error === null ? nothing : html`<p role="alert" data-component="notice" data-kind="error">${s.error}</p>`}
      ${
        s.list === null
          ? s.error === null
            ? html`<p role="status" data-component="loading">Loading…</p>`
            : nothing
          : s.list.total === 0
            ? html`<p role="status" data-component="empty">No orders match these filters.</p>`
            : html`<div class="admin-table-wrap" tabindex="0" role="region" aria-label="Orders">
                  <table class="admin-table" data-component="admin-table">
                    <caption role="status">
                      ${s.list.total} ${s.list.total === 1 ? 'order' : 'orders'}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Order</th>
                        <th scope="col">Placed</th>
                        <th scope="col">Customer</th>
                        <th scope="col">Status</th>
                        <th scope="col" class="num">Items</th>
                        <th scope="col" class="num">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${s.list.rows.map(row)}
                    </tbody>
                  </table>
                </div>
                ${pager(s.list.page, s.list.pages, (page) => ordersHref({ ...f, page }))}`
      }
    </section>`;
  },
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-admin-orders': InstanceType<typeof AdminOrders>;
  }
}
