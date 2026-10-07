// The documents' global CSS (each sheet declares its layers; ADR 0006 rule 3). renderPage hashes
// what a shell writes as <style> into its Content-Security-Policy; prerendered pages get the
// storefront shell's hashes from csp.ts staticPolicy().
import { accountCss } from '../ui/styles/account.js';
import { adminCss } from '../ui/styles/admin.js';
import { authCss } from '../ui/account/auth-form.js';
import { baseCss } from '../ui/styles/base.js';
import { cartCss } from '../ui/styles/cart.js';
import { catalogCss } from '../ui/styles/catalog.js';
import { checkoutCss } from '../ui/styles/checkout.js';
import { consentCss } from '../ui/styles/consent.js';
import { contentCss } from '../ui/styles/content.js';
import { filtersCss } from '../ui/styles/filters.js';
import { headerCss } from '../ui/styles/header.js';
import { listingCss } from '../ui/styles/listing.js';
import { memberFormCss } from '../ui/forms/member-form.js';
import { ordersCss } from '../ui/styles/orders.js';
import { productCss } from '../ui/styles/product.js';
import { searchCss } from '../ui/styles/search.js';
import { themeSwitcherCss } from '../ui/styles/theme-switcher.js';
import { wishlistCss } from '../ui/styles/wishlist.js';

/** Document CSS, in cascade order (each sheet declares its layers; ADR 0006 rule 3). */
export const DOCUMENT_STYLES = [
  baseCss,
  headerCss,
  catalogCss,
  listingCss,
  filtersCss,
  productCss,
  accountCss,
  authCss,
  cartCss,
  ordersCss,
  memberFormCss,
  contentCss,
  checkoutCss,
  wishlistCss,
  adminCss,
  searchCss,
  consentCss,
  themeSwitcherCss,
  // The theme is not inline: <link id="theme-css"> in the head (document.ts themeLink). It only
  // writes to @layer theme, which wins by layer order wherever the sheet appears.
];

/** Order status badges reuse the storefront's order styles. */
export const ADMIN_STYLES = [baseCss, ordersCss, adminCss, adminShellCss()];

function adminShellCss(): string {
  return `
@layer components {
  .admin-header {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-4);
    align-items: center;
    justify-content: space-between;
    padding-block: var(--space-2);
    padding-inline: var(--space-3);
    border-block-end: 1px solid var(--line);
    background: var(--surface-raised);
  }
  .admin-header p { margin: 0; }
  .admin-header .admin-site { font-weight: 700; }
  .admin-header nav ul {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: center;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .admin-header form { display: inline; }
  .admin-header button {
    font: inherit;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
}`;
}
