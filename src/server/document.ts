// The server-only document shell: head, skip link, header, main, footer (lit-web-apps skill:
// document.ts). Only the custom elements inside hydrate; the shell itself never does.
import { html, nothing, type AnyStoreInstance } from '@gyral/core';
import { renderPage } from '@gyral/ssr';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import type { AccountSummary, DepartmentLink } from '../ui/layout/site-header.js';
import '../ui/layout/site-header.js'; // registers <shop-header> for server rendering
import '../ui/consent/consent.js'; // registers <shop-consent>
import { consentCss } from '../ui/styles/consent.js';
import { currentConsent, currentPath } from './consent.js';
import { searchCss } from '../ui/styles/search.js';
import { CSRF_META } from '../ui/forms/csrf.js';
import { baseCss } from '../ui/styles/base.js';
import { headerCss } from '../ui/styles/header.js';
import { defaultThemeCss } from '../ui/themes/default.css.js';
import { catalogCss } from '../ui/styles/catalog.js';
import { filtersCss } from '../ui/styles/filters.js';
import { listingCss } from '../ui/styles/listing.js';
import { accountCss } from '../ui/styles/account.js';
import { memberFormCss } from '../ui/forms/member-form.js';
import { contentCss } from '../ui/styles/content.js';
import { productCss } from '../ui/styles/product.js';
import { ordersCss } from '../ui/styles/orders.js';
import { checkoutCss } from '../ui/styles/checkout.js';
import { wishlistCss } from '../ui/styles/wishlist.js';
import { adminCss } from '../ui/styles/admin.js';

import { documentTitle, SITE_NAME } from '../ui/layout/site.js';

export { SITE_NAME };

export interface ShellOptions {
  /** URL of the browser entry module (Vite dev: a source path; prod: a built asset). */
  readonly clientEntry: string;
  readonly title: string;
  readonly description?: string;
  readonly departments: readonly DepartmentLink[];
  readonly query?: string;
  /** The page's main content (a Lit template, usually one page component). */
  readonly main: unknown;
  readonly status?: number;
  /** Account, cart, checkout and admin pages are not for search engines (SEO spec). */
  readonly noindex?: boolean;
  /** Pages with forms or fetches pass the session's CSRF token (security/csrfTokenFor). */
  readonly csrfToken?: string;
  /** Absolute canonical URL (SEO spec). */
  readonly canonical?: string;
  /** Structured data objects, each written as an `application/ld+json` script. */
  readonly jsonLd?: readonly object[];
  /** Slug of the department this page belongs to, marked current in the header nav. */
  readonly currentDepartment?: string;
  /** The signed-in member, for the header's account menu (set by createApp's page()). */
  readonly account?: AccountSummary;
  /** Open Graph `<meta property>` pairs (SEO spec), e.g. `['og:type', 'product']`. */
  readonly meta?: readonly (readonly [property: string, content: string])[];
  /** `<meta name>` pairs, e.g. Twitter cards: `['twitter:card', 'summary_large_image']`. */
  readonly metaNames?: readonly (readonly [name: string, content: string])[];
  /** Per-request store instances, read during the render and seeded for hydration. */
  readonly stores?: readonly AnyStoreInstance[];
  /**
   * Prerendered at build time (ssg): the same HTML for every visitor, so the header asks for
   * the account after hydration and the mini-cart loads the cart (Gyral ADR 0016).
   */
  readonly static?: boolean;
}

/** JSON for a <script> body: `<` is escaped so content can never close the element. */
const scriptJson = (value: object): string => JSON.stringify(value).replace(/</g, '\\u003c');

const footer = html`
  <footer class="site-footer">
    <div class="page">
      <nav aria-label="Site">
        <ul>
          <li><a href="/about">About</a></li>
          <li><a href="/faq">FAQ</a></li>
          <li><a href="/contact">Contact</a></li>
          <li><a href="/terms">Terms</a></li>
          <li><a href="/privacy">Privacy</a></li>
          <li><a href="/consent">Cookie settings</a></li>
        </ul>
      </nav>
      <p>
        <small>© 2026 ${SITE_NAME}. A demo store built with Gyral; nothing here is for sale.</small>
      </p>
    </div>
  </footer>
`;

/** Document CSS, in cascade order (each sheet declares its layers; ADR 0006 rule 3). */
const DOCUMENT_STYLES = [
  baseCss,
  headerCss,
  catalogCss,
  listingCss,
  filtersCss,
  productCss,
  accountCss,
  ordersCss,
  memberFormCss,
  contentCss,
  checkoutCss,
  wishlistCss,
  adminCss,
  searchCss,
  consentCss,
  // The theme last: it only writes to @layer theme, which wins by layer order.
  defaultThemeCss,
];

/**
 * The consent banner for undecided visitors (never on the settings page itself). Prerendered
 * pages can't know the visitor, so they carry a deferred banner that asks `/api/me` after
 * hydration and opens only if this visitor hasn't decided.
 */
function consentBanner(prerendered: boolean) {
  const path = currentPath();
  if (path.startsWith('/consent')) return nothing;
  if (prerendered) {
    return html`<shop-consent mode="banner" deferred return-to=${path}></shop-consent>`;
  }
  return currentConsent().decided
    ? nothing
    : html`<shop-consent mode="banner" return-to=${path}></shop-consent>`;
}

export function shell(options: ShellOptions): Response {
  const structured = (options.jsonLd ?? [])
    .map((data) => `<script type="application/ld+json">${scriptJson(data)}</script>`)
    .join('');
  const head = html`<link rel="icon" href="/favicon.svg" type="image/svg+xml" /> ${
      options.canonical === undefined
        ? nothing
        : html`<link rel="canonical" href=${options.canonical} />`
    }
    ${options.noindex === true ? html`<meta name="robots" content="noindex" />` : nothing}
    ${
      options.csrfToken === undefined
        ? nothing
        : html`<meta name=${CSRF_META} content=${options.csrfToken} />`
    }
    ${(options.meta ?? []).map(([property, content]) => html`<meta property=${property} content=${content} />`)}
    ${(options.metaNames ?? []).map(([name, content]) => html`<meta name=${name} content=${content} />`)}
    ${structured === '' ? nothing : unsafeHTML(structured)}`;
  return renderPage(
    {
      title: documentTitle(options.title),
      styles: DOCUMENT_STYLES,
      ...(options.description === undefined ? {} : { description: options.description }),
      head,
      body: html`
        <nav class="skip-links" aria-label="Skip links">
          <a class="skip-link" href="#main">Skip to content</a>
        </nav>
        <shop-header
          .departments=${options.departments}
          query=${options.query ?? ''}
          current=${options.currentDepartment ?? ''}
          .account=${options.account}
          ?personalize=${options.static === true}
        ></shop-header>
        ${consentBanner(options.static === true)}
        <main id="main" class="page" tabindex="-1">${options.main}</main>
        ${footer}
      `,
      scripts: [options.clientEntry],
      stores: options.stores ?? [],
    },
    { status: options.status ?? 200 },
  );
}

/** Renders a page inside the shell; created per app so the header's departments are loaded. */
export type RenderPage = (
  options: Omit<ShellOptions, 'clientEntry' | 'departments'>,
) => Promise<Response>;
