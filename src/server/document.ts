// The server-only document shell: head, skip link, header, main, footer (lit-web-apps skill:
// document.ts). Only the custom elements inside hydrate; the shell itself never does.
import { html, nothing } from '@gyral/core';
import { renderPage } from '@gyral/ssr';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import type { AccountSummary, DepartmentLink } from '../ui/layout/site-header.js';
import '../ui/layout/site-header.js'; // registers <shop-header> for server rendering
import { CSRF_META } from '../ui/forms/csrf.js';
import { baseCss } from '../ui/styles/base.js';
import { catalogCss } from '../ui/styles/catalog.js';
import { listingCss } from '../ui/styles/listing.js';
import { accountCss } from '../ui/styles/account.js';
import { productCss } from '../ui/styles/product.js';

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
  /** Open Graph / Twitter `<meta property>` pairs (SEO spec), e.g. `['og:type', 'product']`. */
  readonly meta?: readonly (readonly [property: string, content: string])[];
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
        </ul>
      </nav>
      <p>
        <small>© 2026 ${SITE_NAME}. A demo store built with Gyral; nothing here is for sale.</small>
      </p>
    </div>
  </footer>
`;

export function shell(options: ShellOptions): Response {
  const structured = (options.jsonLd ?? [])
    .map((data) => `<script type="application/ld+json">${scriptJson(data)}</script>`)
    .join('');
  const head = html`${unsafeHTML(`<style>${baseCss}${catalogCss}${listingCss}${productCss}${accountCss}</style>`)}
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    ${
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
    ${structured === '' ? nothing : unsafeHTML(structured)}`;
  return renderPage(
    {
      title: documentTitle(options.title),
      ...(options.description === undefined ? {} : { description: options.description }),
      head,
      body: html`
        <a class="skip-link" href="#main">Skip to content</a>
        <shop-header
          .departments=${options.departments}
          query=${options.query ?? ''}
          current=${options.currentDepartment ?? ''}
          .account=${options.account}
        ></shop-header>
        <main id="main" class="page" tabindex="-1">${options.main}</main>
        ${footer}
      `,
      scripts: [options.clientEntry],
    },
    { status: options.status ?? 200 },
  );
}

/** Renders a page inside the shell; created per app so the header's departments are loaded. */
export type RenderPage = (
  options: Omit<ShellOptions, 'clientEntry' | 'departments'>,
) => Promise<Response>;
