// The server-only document shell: head, skip link, header, main, footer. Only the custom
// elements inside hydrate; the shell itself never does.
import { html, nothing, raw, type AnyStoreInstance } from '@gyral/core';
import { renderPage, type CspOptions } from '@gyral/ssr';
import type { AccountSummary, DepartmentLink } from '../ui/layout/site-header.js';
import '../ui/layout/site-header.js'; // registers <shop-header> for server rendering
import '../ui/consent/consent.js'; // registers <shop-consent>
import { currentConsent, currentPath } from './consent.js';
import { CSRF_META } from '../ui/forms/csrf.js';
import { DOCUMENT_STYLES } from './page-styles.js';
import type { Preload, RouteChunk } from './route-chunks.js';
import '../ui/theme/switcher.js'; // registers <shop-theme-switcher>
import { CURRENT_THEME_PATH, currentTheme, themeHref, themeOptions } from './theme.js';

import { documentTitle, SITE_NAME } from '../ui/layout/site.js';

export { SITE_NAME };

export interface ShellOptions {
  /** URL of the browser entry module (Vite dev: a source path; prod: a built asset). */
  readonly clientEntry: string;
  /** Modules to preload with the entry (production; see AppOptions.modulepreload). */
  readonly modulepreload?: readonly string[];
  /** Production: `modulepreload` plus route chunks (see AppOptions.preload). */
  readonly preload?: Preload;
  /** The lazily loaded modules this page's components need, preloaded in production. */
  readonly chunks?: readonly RouteChunk[];
  /** The Content-Security-Policy, built when the page renders (csp.ts `pageCsp`). */
  readonly csp?: CspOptions;
  readonly title: string;
  readonly description?: string;
  readonly departments: readonly DepartmentLink[];
  readonly query?: string;
  /** The page's main content (an `html` template, usually one page component). */
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

/** The footer, with the theme switcher (ADR 0006 rule 8; prerendered pages ask /api/me). */
const footer = (prerendered: boolean) => html`
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
      <shop-theme-switcher
        .themes=${themeOptions()}
        current=${prerendered ? '' : currentTheme().name}
        return-to=${currentPath()}
        ?deferred=${prerendered}
      ></shop-theme-switcher>
      <p>
        <small>© 2026 ${SITE_NAME}. A demo store built with Gyral; nothing here is for sale.</small>
      </p>
    </div>
  </footer>
`;

/**
 * The theme stylesheet (ADR 0006 rule 8). A render-blocking <link>, so the right theme paints
 * first. Server-rendered pages link the visitor's theme by its content-hashed URL; prerendered
 * pages link /themes/current.css, which the server answers from the visitor's cookie.
 */
function themeLink(prerendered: boolean) {
  if (prerendered) return html`<link rel="stylesheet" id="theme-css" href=${CURRENT_THEME_PATH} />`;
  const theme = currentTheme();
  return html`<link
    rel="stylesheet"
    id="theme-css"
    href=${themeHref(theme)}
    data-theme=${theme.name}
  />`;
}

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
  const head = html`<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    ${themeLink(options.static === true)}
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
    ${(options.metaNames ?? []).map(([name, content]) => html`<meta name=${name} content=${content} />`)}
    ${structured === '' ? nothing : raw(structured)}`;
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
        ${footer(options.static === true)}
      `,
      scripts: [options.clientEntry],
      modulepreload:
        options.chunks === undefined || options.preload === undefined
          ? (options.modulepreload ?? [])
          : options.preload(options.chunks),
      stores: options.stores ?? [],
      ...(options.csp === undefined ? {} : { csp: options.csp }),
    },
    { status: options.status ?? 200 },
  );
}

/** Renders a page inside the shell; created per app so the header's departments are loaded. */
export type RenderPage = (
  options: Omit<ShellOptions, 'clientEntry' | 'modulepreload' | 'preload' | 'departments'>,
) => Promise<Response>;
