// The admin route table (docs/product-specs/admin.md), shared by the server (page titles,
// the first render) and the browser app. Order matters: `/admin/products/new` before `:id`.
import { routes } from '@gyral/router';
import { documentTitle } from '../layout/site.js';

export const adminRoutes = routes({
  dashboard: '/admin',
  products: '/admin/products',
  newProduct: '/admin/products/new',
  product: '/admin/products/:id',
  orders: '/admin/orders',
  order: '/admin/orders/:number',
  promos: '/admin/promos',
  newPromo: '/admin/promos/new',
  promo: '/admin/promos/:id',
  users: '/admin/users',
  reviews: '/admin/reviews',
});

export type AdminView =
  | { readonly name: 'dashboard' }
  | { readonly name: 'products'; readonly search: string }
  | { readonly name: 'newProduct' }
  | { readonly name: 'product'; readonly id: number }
  | { readonly name: 'orders'; readonly search: string }
  | { readonly name: 'order'; readonly number: string }
  | { readonly name: 'promos' }
  | { readonly name: 'newPromo' }
  | { readonly name: 'promo'; readonly id: number }
  | { readonly name: 'users'; readonly search: string }
  | { readonly name: 'reviews'; readonly search: string }
  | { readonly name: 'notFound' };

/** What an admin URL (path + query) shows. */
export function adminView(url: string): AdminView {
  const parsed = new URL(url, 'http://admin.invalid');
  const match = adminRoutes.match(parsed.pathname);
  switch (match?.name) {
    case 'dashboard':
    case 'newProduct':
    case 'promos':
    case 'newPromo':
      return { name: match.name };
    case 'products':
    case 'orders':
    case 'users':
    case 'reviews':
      return { name: match.name, search: parsed.search };
    case 'product':
    case 'promo': {
      const id = Number(match.params.id);
      return Number.isSafeInteger(id) && id > 0 ? { name: match.name, id } : { name: 'notFound' };
    }
    case 'order':
      return { name: 'order', number: match.params.number };
    case undefined:
      return { name: 'notFound' };
  }
}

const LABELS: Readonly<Record<AdminView['name'], string>> = {
  dashboard: 'Dashboard',
  products: 'Products',
  newProduct: 'New product',
  product: 'Edit product',
  orders: 'Orders',
  order: 'Order',
  promos: 'Promo codes',
  newPromo: 'New promo code',
  promo: 'Edit promo code',
  users: 'Users',
  reviews: 'Reviews',
  notFound: 'Not found',
};

/** The page heading for an admin URL, e.g. "Products" or "Order GG-…". */
export function adminLabel(url: string): string {
  const view = adminView(url);
  return view.name === 'order' ? `Order ${view.number}` : LABELS[view.name];
}

/** The server shell's title for an admin URL (the shell appends the site name). */
export const adminPageTitle = (url: string): string => `${adminLabel(url)} — Admin`;

/** The full document title, for the browser's setTitle(); matches the server's <title>. */
export const adminTitle = (url: string): string => documentTitle(adminPageTitle(url));

/** Which nav section an admin view belongs to. */
export type AdminSection = 'dashboard' | 'products' | 'orders' | 'promos' | 'users' | 'reviews';

export function adminSection(view: AdminView): AdminSection | undefined {
  switch (view.name) {
    case 'dashboard':
      return 'dashboard';
    case 'products':
    case 'newProduct':
    case 'product':
      return 'products';
    case 'orders':
    case 'order':
      return 'orders';
    case 'promos':
    case 'newPromo':
    case 'promo':
      return 'promos';
    case 'users':
    case 'reviews':
      return view.name;
    case 'notFound':
      return undefined;
  }
}
