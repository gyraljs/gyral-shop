// <shop-admin-promos>: every promo code with its rules, window, usage and status
// (docs/product-specs/admin.md, "Promo codes"; ADR 0003).
import { define, html, nothing } from '@gyral/core';
import { get, type HttpError } from '@gyral/http';
import {
  promoAmountLabel,
  PromoListSchema,
  type PromoList,
  type PromoRow,
  type PromoStatus,
} from '../../domain/admin-manage.js';
import { format, usd } from '../../domain/money.js';
import { adminDrivers } from './drivers.js';
import { dateOnly, loadError } from './format.js';

export interface PromosState {
  readonly list: PromoList | null;
  readonly error: string | null;
}

export type PromosMsg =
  | { readonly _tag: 'Loaded'; readonly list: PromoList }
  | { readonly _tag: 'Failed'; readonly error: HttpError };

const STATUS_LABEL: Readonly<Record<PromoStatus, string>> = {
  active: 'Active',
  scheduled: 'Scheduled',
  expired: 'Expired',
  'used-up': 'Used up',
  inactive: 'Inactive',
};

const load = () =>
  get('/api/admin/promos', {
    schema: PromoListSchema,
    onSuccess: (list): PromosMsg => ({ _tag: 'Loaded', list }),
    onFailure: (error): PromosMsg => ({ _tag: 'Failed', error }),
    key: 'admin-promos',
    concurrency: 'switch',
  });

/** "Nov 27, 2026 – Dec 1, 2026", "From Nov 27, 2026", "Until …", or "Always". */
function windowLabel(p: PromoRow): string {
  // Calendar days in the store's time zone, formatted as plain dates (no zone shift).
  const day = (text: string | null) => (text === null ? null : dateOnly.format(new Date(text)));
  const start = day(p.startsOn);
  const end = day(p.endsOn);
  if (start !== null && end !== null) return `${start} – ${end}`;
  if (start !== null) return `From ${start}`;
  if (end !== null) return `Until ${end}`;
  return 'Always';
}

function row(p: PromoRow) {
  return html`<tr data-component="promo-row">
    <td>
      <a href=${`/admin/promos/${String(p.id)}`}><code>${p.code}</code></a>
    </td>
    <td>${promoAmountLabel(p)}</td>
    <td class="num">${p.minSubtotalCents === 0 ? '—' : format(usd(p.minSubtotalCents))}</td>
    <td>${p.department ?? 'All departments'}</td>
    <td>${windowLabel(p)}</td>
    <td class="num">
      ${p.usedCount}${p.usageLimit === null ? nothing : html` of ${p.usageLimit}`}
    </td>
    <td>
      <span data-component="promo-status" data-status=${p.status}>${STATUS_LABEL[p.status]}</span>
    </td>
  </tr>`;
}

export const AdminPromos = define<PromosState, PromosMsg>()('shop-admin-promos', {
  shadow: false,
  init: () => [{ list: null, error: null }, [load()]],
  intent: {},
  update: {
    Loaded: (s, m) => ({ ...s, list: m.list, error: null }),
    Failed: (s, m) => ({ ...s, error: loadError(m.error) }),
  },
  drivers: adminDrivers,
  view: (s) =>
    html`<section class="admin-page" data-region="admin-promos">
      <h1 tabindex="-1">Promo codes</h1>
      <div class="admin-toolbar">
        <a class="button" href="/admin/promos/new">New promo code</a>
      </div>
      ${
        s.error === null
          ? nothing
          : html`<p role="alert" data-component="notice" data-kind="error">${s.error}</p>`
      }
      ${
        s.list === null
          ? s.error === null
            ? html`<p role="status" data-component="loading">Loading…</p>`
            : nothing
          : s.list.rows.length === 0
            ? html`<p data-component="empty">No promo codes yet.</p>`
            : html`<div
                class="admin-table-wrap"
                tabindex="0"
                role="region"
                aria-label="Promo codes"
              >
                <table class="admin-table" data-component="admin-table">
                  <caption>
                    ${s.list.rows.length} ${s.list.rows.length === 1 ? 'code' : 'codes'}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Code</th>
                      <th scope="col">Discount</th>
                      <th scope="col" class="num">Minimum</th>
                      <th scope="col">Applies to</th>
                      <th scope="col">Dates</th>
                      <th scope="col" class="num">Used</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${s.list.rows.map(row)}
                  </tbody>
                </table>
              </div>`
      }
    </section>`,
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-admin-promos': InstanceType<typeof AdminPromos>;
  }
}
