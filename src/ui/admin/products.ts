// <shop-admin-products>: searchable, sortable, paginated product table
// (docs/product-specs/admin.md, "Products"). The URL holds the query (q, archived, sort, dir,
// page): intents navigate, the root passes the new search string down, and the table reloads.
import { define, form, html, liveBoolean, nothing, type Next } from '@gyral/core';
import { get, type HttpError } from '@gyral/http';
import { navigate } from '@gyral/router';
import * as v from 'valibot';
import {
  PRODUCT_SORTS,
  ProductListSchema,
  type ProductList,
  type ProductSort,
} from '../../domain/admin.js';
import { format, usd } from '../../domain/money.js';
import { adminDrivers } from './drivers.js';
import { loadError } from './format.js';
import { pager, sortHeader } from './table.js';

export interface ProductsProps {
  /** The admin URL's query string, e.g. `?q=tv&sort=price`. */
  readonly search: string;
}

export interface ProductsQuery {
  readonly q: string;
  readonly archived: boolean;
  readonly sort: ProductSort;
  readonly dir: 'asc' | 'desc';
  readonly page: number;
}

export interface ProductsState {
  readonly search: string;
  readonly list: ProductList | null;
  readonly error: string | null;
}

export type ProductsMsg =
  | { readonly _tag: 'Search'; readonly q: string; readonly archived: boolean }
  | { readonly _tag: 'Sort'; readonly sort: ProductSort }
  | { readonly _tag: 'Loaded'; readonly search: string; readonly list: ProductList }
  | { readonly _tag: 'Failed'; readonly error: HttpError };

export function productsQuery(search: string): ProductsQuery {
  const params = new URLSearchParams(search);
  const sort = PRODUCT_SORTS.find((s) => s === params.get('sort')) ?? 'name';
  const page = Number(params.get('page') ?? '1');
  return {
    q: (params.get('q') ?? '').trim(),
    archived: params.get('archived') === 'yes',
    sort,
    dir: params.get('dir') === 'desc' ? 'desc' : 'asc',
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function productsHref(query: ProductsQuery): string {
  const params = new URLSearchParams();
  if (query.q !== '') params.set('q', query.q);
  if (query.archived) params.set('archived', 'yes');
  if (query.sort !== 'name') params.set('sort', query.sort);
  if (query.dir !== 'asc') params.set('dir', query.dir);
  if (query.page > 1) params.set('page', String(query.page));
  const text = params.toString();
  return text === '' ? '/admin/products' : `/admin/products?${text}`;
}

const load = (search: string) => {
  const query = productsQuery(search);
  const params = new URLSearchParams({
    q: query.q,
    sort: query.sort,
    dir: query.dir,
    archived: query.archived ? 'yes' : 'no',
    page: String(query.page),
  });
  return get(`/api/admin/products?${params.toString()}`, {
    schema: ProductListSchema,
    onSuccess: (list): ProductsMsg => ({ _tag: 'Loaded', search, list }),
    onFailure: (error): ProductsMsg => ({ _tag: 'Failed', error }),
    key: 'admin-products',
    concurrency: 'switch',
  });
};

const SearchForm = v.object({
  q: v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(100, 'Use at most 100 characters.')),
  archived: v.optional(v.picklist(['yes', 'no']), 'no'),
});

const money = (cents: number) => format(usd(cents));

function row(p: ProductList['rows'][number]) {
  return html`<tr data-component="product-row">
    <td>
      <a href=${`/admin/products/${String(p.id)}`}>${p.name}</a>
      <small>/p/${p.slug}</small>
    </td>
    <td>${p.brand}</td>
    <td>${p.department}<small>${p.category}</small></td>
    <td class="num">
      ${
        p.salePriceCents === null
          ? money(p.priceCents)
          : html`${money(p.salePriceCents)}<small><del>${money(p.priceCents)}</del></small>`
      }
    </td>
    <td class="num" data-stock=${p.stock === 0 ? 'out' : p.stock <= 5 ? 'low' : nothing}>
      ${p.stock}
    </td>
    <td class="num">${p.variants}</td>
    <td>${p.archived ? 'Archived' : 'Live'}</td>
  </tr>`;
}

export const AdminProducts = define<ProductsState, ProductsMsg, ProductsProps>(
  'shop-admin-products',
  {
    shadow: false,
    props: { search: { type: String, default: '' } },
    init: (props) => [{ search: props.search, list: null, error: null }, [load(props.search)]],
    intent: {
      Search: form(SearchForm, (data) => ({
        _tag: 'Search',
        q: data.q,
        archived: data.archived === 'yes',
      })),
      Sort: ({ value }) => {
        const sort = PRODUCT_SORTS.find((s) => s === value);
        return sort === undefined ? undefined : { _tag: 'Sort', sort };
      },
    },
    update: {
      Search: (s, m) => [
        s,
        [
          navigate(
            productsHref({ ...productsQuery(s.search), q: m.q, archived: m.archived, page: 1 }),
          ),
        ],
      ],
      Sort: (s, m): Next<ProductsState, ProductsMsg> => {
        const query = productsQuery(s.search);
        const dir = query.sort === m.sort && query.dir === 'asc' ? 'desc' : 'asc';
        return [s, [navigate(productsHref({ ...query, sort: m.sort, dir, page: 1 }))]];
      },
      Loaded: (s, m) => (m.search === s.search ? { ...s, list: m.list, error: null } : s),
      Failed: (s, m) => ({ ...s, error: loadError(m.error) }),
      PropsChanged: (s, m) =>
        m.props.search === s.search
          ? s
          : [{ ...s, search: m.props.search }, [load(m.props.search)]],
    },
    drivers: adminDrivers,
    view: (s) => {
      const query = productsQuery(s.search);
      return html`<section class="admin-page" data-region="admin-products">
        <h1 tabindex="-1">Products</h1>
        <form
          class="admin-toolbar"
          data-intent="Search"
          role="search"
          data-component="product-search"
        >
          <label>Search name, slug or SKU <input type="search" name="q" .value=${query.q} /></label>
          <label
            >Show
            <select name="archived">
              <option value="no" ?selected=${liveBoolean(!query.archived)}>Live products</option>
              <option value="yes" ?selected=${liveBoolean(query.archived)}>
                Archived products
              </option>
            </select>
          </label>
          <button type="submit">Search</button>
          <a class="button" data-variant="quiet" href="/admin/products/new">New product</a>
        </form>
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
            : html`<div class="admin-table-wrap" tabindex="0" role="region" aria-label="Products">
                  <table class="admin-table" data-component="admin-table">
                    <caption role="status">
                      ${s.list.total} ${s.list.total === 1 ? 'product' : 'products'}
                    </caption>
                    <thead>
                      <tr>
                        ${sortHeader('Name', 'name', query)}
                        <th scope="col">Brand</th>
                        <th scope="col">Department</th>
                        ${sortHeader('Price', 'price', query, 'num')}
                        ${sortHeader('Stock', 'stock', query, 'num')}
                        <th scope="col" class="num">Variants</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${s.list.rows.map(row)}
                    </tbody>
                  </table>
                </div>
                ${pager(s.list.page, s.list.pages, (page) => productsHref({ ...query, page }))}`
        }
      </section>`;
    },
  },
);

declare global {
  interface HTMLElementTagNameMap {
    'shop-admin-products': InstanceType<typeof AdminProducts>;
  }
}
