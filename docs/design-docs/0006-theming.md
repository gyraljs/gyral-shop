# ADR 0006 — Theming: a Zen Garden contract

Status: **accepted** (2026-10-04). Binding on all UI work from now on. Epic: "Themes (Zen Garden)".

## Context

The shop should be able to switch its whole look between themes: today's default plus three
themes _inspired by_ big-box retailers. **Marketplace** is dense, navy and orange. **Supercenter**
is blue and yellow, rounded and friendly. **Boutique** is red and white, airy and minimal. Each
theme uses our own names, with no third-party logos or brand assets.

A theme changes layout as well as colour, exactly as the CSS Zen Garden did. That only works if
markup stays semantic and stable and every visual decision lives in CSS that a theme can override.

## Decision: the contract

1. **Markup is semantic and theme-neutral.** Use landmarks (`header`, `nav`, `search`, `main`,
   `aside`, `footer`), headings, lists, `article`, `figure`, `dl`, `table`, `form`, `fieldset`.
   Never choose an element for its look. Add no wrapper divs just for styling.
2. **Stable hooks.** A theme may target exactly these:
   - Landmarks and semantic elements.
   - `data-region="…"` on page regions: `header`, `nav`, `search`, `account`, `cart`,
     `breadcrumbs`, `listing`, `filters`, `results`, `product`, `gallery`, `buy-box`, `reviews`,
     `footer`, …
   - `data-component="…"` on repeated units: `product-card`, `price`, `rating`, `pager`, …
   - Container names (`container-name`) on regions and cards.

   New UI must add a hook for anything a theme might reasonably restyle, and must document new
   hooks in the "Hooks" table below. Renaming or removing a hook is a breaking change.

3. **Layers.** Every stylesheet sits in one layer, in this order:
   `@layer reset, tokens, base, components, theme;`. Themes write only to `@layer theme` and
   win by layer order, never by specificity.
4. **Tokens.** Every colour, font, radius, shadow, spacing, density and motion value comes from
   a custom property defined in `@layer tokens` (`src/ui/styles/base.ts`) or in a theme file.
   - **No literals elsewhere.** No hex, `rgb()`, `hsl()` or literal `oklch()` values, and no
     literal `font-family`.
   - **No literal fallbacks** in `var(--x, …)`; a fallback that is another `var()` is allowed.
   - Relative colour from a token (`oklch(from var(--brand) …)`) is fine.
   - Enforced by `scripts/check-styles.mjs` in `pnpm check`.
5. **Light DOM for page structure.** Page-level components (header, listing, product page
   sections, account pages) render in light DOM once Gyral's light-DOM option lands (Gyral
   ADR 0014). That way themes can re-lay them out, and raw-HTML crawlers see the content.
6. **Widgets stay in shadow DOM** (gallery, buy box, form controls). They are styled only
   through tokens and documented `::part()` names. Each widget exposes parts for its visually
   meaningful pieces and lists them in the "Parts" table below.
7. **Themes are stylesheets**, in `src/ui/themes/<name>.css.ts`.
   - Each sets every required token for light and dark (`light-dark()`).
   - Each may restructure layout with grid template areas, container queries, `@scope`,
     `:has()`, subgrid and anchor positioning, following the `modern-css` skill.
   - Each must pass WCAG AA contrast on every page template (axe in tests).
8. **Switching** (epic task):
   - The choice is stored in a `theme` cookie, changed through a no-JS form POST.
   - The server renders the chosen theme's `<link>`, so the wrong theme never flashes.
   - With JS, a Gyral component swaps the link inside a View Transition, respecting
     `prefers-reduced-motion`.
   - The default theme is the current look.

## Hooks (keep current)

| Hook                                                                                                                                                                                                                                                                                                                                                                                                                | Where                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `data-region="header" / "masthead" / "nav" / "search" / "account" / "cart"`, `data-component="brand" / "account-menu"`; container `header`                                                                                                                                                                                                                                                                          | `<shop-header>`, light DOM (`src/ui/layout/site-header.ts`, styles `src/ui/styles/header.ts`); it renders `<shop-search>` and `<shop-mini-cart>` itself                                                            |
| `data-component="product-card" / "price" / "rating"`                                                                                                                                                                                                                                                                                                                                                                | product cards (`src/ui/catalog/product-card.ts`)                                                                                                                                                                   |
| `data-region="listing" / "filters" / "results"`, `data-component="pager" / "filters-panel"` (a `<details>` with container name `filters`: collapsible below 36rem)                                                                                                                                                                                                                                                  | `<shop-listing>`, light DOM (`src/ui/catalog/listing.ts`, `filters.ts`, `pager.ts`); state hook `shop-listing:state(loading)`                                                                                      |
| `data-region="cart"`                                                                                                                                                                                                                                                                                                                                                                                                | `<shop-mini-cart>` (header cart slot, `src/server/document.ts`) and `<shop-cart-page>` (`src/server/routes/cart-page.ts`)                                                                                          |
| `data-region="cart-lines" / "cart-summary"`                                                                                                                                                                                                                                                                                                                                                                         | cart page sections (`src/ui/cart/cart-page.ts`, `cart-summary.ts`)                                                                                                                                                 |
| `data-component="cart-line" / "price" / "quantity" / "promo-code"`                                                                                                                                                                                                                                                                                                                                                  | cart lines and summary (`src/ui/cart/cart-lines.ts`, `cart-summary.ts`, `mini-cart.ts`)                                                                                                                            |
| `data-component="cart-notice"`                                                                                                                                                                                                                                                                                                                                                                                      | buy box add-to-cart status (`src/ui/product/buy-box.ts`)                                                                                                                                                           |
| `data-region="checkout"`                                                                                                                                                                                                                                                                                                                                                                                            | `<shop-checkout>` (light DOM; `src/server/routes/checkout.ts`)                                                                                                                                                     |
| `data-component="checkout-step" / "step-summary" / "step-edit" / "address-form" / "shipping-option" / "card-form" / "place-order" / "order-summary" / "summary-line" / "price"`                                                                                                                                                                                                                                     | checkout steps and summary (`src/ui/checkout/steps.ts`, `summary.ts`)                                                                                                                                              |
| `data-region="order-confirmation" / "delivery" / "order-lines" / "order-totals"`, `data-component="order-number" / "order-line" / "price"`                                                                                                                                                                                                                                                                          | order confirmation, light DOM (`src/ui/pages/order-confirmation.ts`); container `confirmation`                                                                                                                     |
| `data-region="order-history" / "order-detail" / "order-timeline" / "order-cancel" / "order-lookup"`, `data-component="order-table" / "order-row" / "order-status" (with `data-status`) / "order-event" / "cancel-form" / "lookup-form" / "notice" / "pager" / "empty"`                                                                                                                                              | order history, detail and guest lookup, light DOM (`src/ui/pages/order-{history,detail,lookup}.ts`, shared parts in `src/ui/orders/parts.ts`); container `confirmation`                                            |
| `data-region="reviews"`, `data-component="rating-summary" / "rating-distribution" / "rating" / "review-cta" / "review-notice" / "review-sort" / "review-list" / "review" / "review-helpful" / "pager"`                                                                                                                                                                                                              | `<shop-reviews>` island, light DOM (`src/ui/product/reviews-view.ts`), on product pages and `/p/:slug/reviews`                                                                                                     |
| `data-region="write-review"`, `data-component="member-form" / "field"`                                                                                                                                                                                                                                                                                                                                              | write-a-review page (`src/ui/pages/reviews.ts`, `<shop-review-form>`)                                                                                                                                              |
| `data-region="search"`, `data-component="search-suggestions" / "search-suggestion"` (with `data-kind="department" / "category" / "product"`)                                                                                                                                                                                                                                                                        | `<shop-search>`, light DOM, slotted into the header (`src/ui/layout/search-box.ts`); container `search-suggestions`; styles `src/ui/styles/search.ts`                                                              |
| `data-region="consent"`, `data-component="consent-actions" / "consent-custom"`; host `shop-consent[mode="banner" / "page"]`                                                                                                                                                                                                                                                                                         | `<shop-consent>`, light DOM, in the document shell (banner for undecided visitors) and on `/consent` (`src/ui/consent/consent.ts`); styles `src/ui/styles/consent.ts`                                              |
| `data-component="wishlist-toggle"` (`.wish-toggle`, button `aria-pressed`)                                                                                                                                                                                                                                                                                                                                          | `<shop-wish-toggle>`, light DOM, on product cards and product pages (`src/ui/wishlist/toggle.ts`)                                                                                                                  |
| `data-region="wishlist"`, `data-component="wishlist-items" / "wishlist-item" / "wishlist-actions" / "wishlist-empty"`                                                                                                                                                                                                                                                                                               | `/account/wishlist` (`src/ui/pages/wishlist.ts`)                                                                                                                                                                   |
| `data-region="admin" / "admin-nav" / "admin-main" / "admin-nojs" / "admin-not-found" / "admin-dashboard" / "admin-sales" / "admin-orders-by-status" / "admin-low-stock" / "admin-top-products" / "admin-traffic"`, `data-component="stat" / "admin-table" / "notice" (with `data-kind`) / "empty" / "loading"`, `data-stock="out" / "low"`                                                                          | client-rendered admin, light DOM (`src/ui/admin/app.ts`, `dashboard.ts`); container `admin`; state hook `shop-admin-dashboard:state(loading)`                                                                      |
| `data-region="admin-products" / "admin-product" / "admin-variants" / "admin-inventory-log" / "admin-archive"`, `data-component="product-search" / "product-row" / "product-form" / "field" / "variant" / "variant-form" / "stock-form" / "add-variant-form" / "archive-form" / "stock" / "pager"`                                                                                                                   | admin products and inventory, light DOM (`src/ui/admin/products.ts`, `product-views.ts`, `fields.ts`, `table.ts`); sortable headers use `aria-sort`                                                                |
| `data-region="admin-orders" / "admin-order" / "admin-order-actions" / "order-lines" / "order-totals" / "delivery" / "order-timeline"`, `data-component="order-filters" / "order-row" / "order-action" / "refund-form" / "order-line" / "order-event" / "order-status"`                                                                                                                                              | admin orders, light DOM (`src/ui/admin/orders.ts`, `order-detail.ts`); status badges reuse `src/ui/orders/parts.ts`                                                                                                |
| `data-region="auth"`, `data-component="field" / "form-error"`                                                                                                                                                                                                                                                                                                                                                       | `<shop-login>` / `<shop-register>`, light DOM (`src/ui/account/*`, styles `authCss`); field ids are prefixed `auth-`                                                                                               |
| `data-component="notice" / "empty" / "cart-lines" / "checkout-link"`                                                                                                                                                                                                                                                                                                                                                | `<shop-cart-page>`, light DOM (former `::part`s; styles `src/ui/styles/cart.ts`, container `cart`)                                                                                                                 |
| `data-region="category" / "category-nav" / "page-intro" / "categories" / "product" / "product-info" / "gallery" / "buy-box" / "specs" / "description"`, plus a region named after each section's heading id                                                                                                                                                                                                         | page templates in `src/ui/pages/*` (department, category, search, product, content)                                                                                                                                |
| `data-region="hero" / "departments" / "deals" / "top-rated" / "best-sellers" / "new-arrivals"`, `data-component="department-tile" / "category-tile"`, `data-region="listing-nav"` (category side nav)                                                                                                                                                                                                               | home and department pages (`src/ui/pages/home.ts`, `department.ts`), category page (`src/ui/pages/category.ts`); already in the markup, documented here by the Marketplace theme (shop-2w6.4)                      |
| container `card` on `.product-card`                                                                                                                                                                                                                                                                                                                                                                                 | product cards (`src/ui/styles/catalog.ts`)                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----------------------------------------------------------------------------------------------------------------------------------------------------------------------                                            |
| `data-region="admin-promos" / "admin-promo" / "admin-promo-delete" / "admin-users" / "admin-confirm" / "admin-reviews"`, `data-component="promo-row" / "promo-status" (with `data-status`) / "promo-form" / "promo-delete-form" / "promo-delete-note" / "user-search" / "user-row" / "user-action" / "user-confirm" / "review-search" / "admin-review" (with `data-hidden`) / "review-moderation" / "result-count"` | admin promo codes, users and review moderation, light DOM (`src/ui/admin/promos.ts`, `promo-edit.ts`, `users.ts`, `reviews.ts`)                                                                                    |
| `data-region="admin-taxonomy" / "admin-departments" / "admin-brands"`, `data-component="taxon" (with `data-kind`, `data-archived`) / "taxon-create" / "taxon-rename" / "taxon-archive"`                                                                                                                                                                                                                             | admin departments, categories and brands, light DOM (`src/ui/admin/taxonomy.ts`)                                                                                                                                   |
| `data-region="admin-header"`, `data-component="admin-store-link" / "admin-account" / "admin-sign-out"`                                                                                                                                                                                                                                                                                                              | the admin document shell, server-only (`src/server/admin-document.ts`); no storefront header, cart, consent banner or footer                                                                                       |
| `data-region="theme-switcher"`, `data-component="theme-option"`                                                                                                                                                                                                                                                                                                                                                     | `<shop-theme-switcher>`, light DOM, in every storefront footer and on `/theme` (`src/ui/theme/switcher.ts`, styles `src/ui/styles/theme-switcher.ts`); the theme stylesheet is `<link id="theme-css">` in the head |

## Parts (keep current)

| Widget           | Parts                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `shop-mini-cart` | `link` (no cart known), `disclosure`, `summary`, `badge`, `panel`, `line`, `subtotal`, `actions` |
| `shop-buy-box`   | `price`, `stock`, `choices`, `option`, `quantity`, `quantity-input`, `add-button`, `added`       |
| `shop-gallery`   | `gallery`, `views`, `view`, `thumbs`, `thumb`, `status`, `empty`                                 |

## Consequences

- Every UI change is reviewed against this contract. The style check catches literal values;
  the hook and part tables are kept up to date by the change that introduces the hook or part.
- Themes can be added without touching components.
- Until the light-DOM task lands, themes can re-skin but not fully re-lay out
  shadow-rendered regions.

## Addendum: the foundation (shop-2w6.2, 2026-10-05)

**Inventory.** Page structure renders in light DOM; true widgets keep a shadow root and expose
`::part`s (rules 5 and 6). Checked by `test/node/theme-hooks.test.ts`, which also proves page
content (h1, product links, prices, forms) sits outside every `<template shadowrootmode>`.

| Component                                                                                                           | DOM    | Why                                                                     |
| ------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| `<shop-header>` (+ nested `<shop-search>`)                                                                          | light  | page structure; themes re-lay out the masthead and nav                  |
| `<shop-listing>`, `<shop-reviews>`, `<shop-checkout>`, `<shop-consent>`, `<shop-wish-toggle>`, `<shop-review-form>` | light  | already light before this task                                          |
| `<shop-login>`, `<shop-register>`, `<shop-cart-page>`                                                               | light  | moved in this task                                                      |
| `<shop-mini-cart>`                                                                                                  | shadow | widget: badge + disclosure panel; `::part`s above                       |
| `<shop-buy-box>`, `<shop-gallery>`                                                                                  | shadow | widgets with their own interaction; `::part`s above                     |
| `<shop-admin>` and admin views                                                                                      | light  | client-rendered admin (theme applies, but themes target the storefront) |

**Layers and the default theme.** `base.ts` declares `@layer reset, tokens, base, components,
theme`. `@layer tokens` holds system tokens (spacing, page width, type scale `--step-*`,
`--brand-size`, `--font-display`) and component tokens derived from the palette
(`--header-bg/-ink`, `--nav-bg/-ink`), with a neutral palette of CSS system colours as the
fallback: without any theme the store is plain but usable and passes contrast. Today's look
lives in `src/ui/themes/default.css.ts` (`@layer theme`), which is always loaded last by the
document shell. Sibling themes define the same palette tokens and may re-lay out regions
through the hooks above. Visual compare (shop `pnpm ui:check --compare`) shows the default
theme pixel-identical to the pre-theme look on all 13 scenario pages.

**Known issue (Gyral, reported to the coordinator).** Production builds of light-DOM
components misbehave at hydration; dev builds and tests are clean. Measured 2026-10-05 on a
production build (`pnpm build && pnpm start`), counting regions after hydration on home,
department, category, product, cart, sign-in and about: with this branch before merging main,
every light-DOM region rendered twice; after merging main (same linked Gyral), nothing is
duplicated but each page logs one "Hydration value mismatch" (the light-DOM header), where main
alone logs one on the category page (the listing). A Gyral fix is in progress.

## Addendum: switching (shop-2w6.3, 2026-10-05)

- **Registry.** A theme is one file, `src/ui/themes/<name>.css.ts`, exporting a
  `ThemeDefinition` (`name`, `label`, `description`, `css`), plus its line in
  `src/ui/themes/registry.ts` (server-only). `test/node/theme-switcher.test.ts` fails if a
  theme file is not registered, a name is invalid, or a stylesheet does not start with
  `@layer theme`.
- **Stylesheets are files, never inline.** `GET /themes/<name>.<hash>.css` serves a theme
  at a URL fingerprinted from its CSS, cached for a year (`immutable`); a stale hash is 404.
  The document shell renders `<link rel="stylesheet" id="theme-css">` in the head:
  render-blocking, so the chosen theme paints first.
- **Server-rendered pages** link the visitor's theme (the `theme` cookie when it names a
  shipped theme, otherwise `default`) by its hashed URL.
- **Prerendered pages** are the same HTML for everyone, so they link
  `/themes/current.css`, which the server answers from the visitor's cookie with
  `Cache-Control: private, no-cache`, `Vary: Cookie` and an ETag per theme. The right theme
  with no script, no inline code (CSP unchanged) and no flash; the cost is one revalidation
  request per static page view. The footer switcher there starts with no radio checked and
  learns the theme from `/api/me` (which now reports `theme`) after hydration.
- **Without JavaScript** the footer control is a POST form to `/theme` (fieldset, radios,
  "Apply theme"); it sets the cookie (1 year, HttpOnly, SameSite=Lax) and redirects back to
  the page (`safeNext`). `POST /theme` is origin-verified like `/consent`, so choosing a theme
  never starts a session. An unknown theme re-renders `/theme` with a 422 message.
- **With JavaScript** picking a radio applies at once: the `theme-link` driver
  (`src/ui/theme/link-driver.ts`) loads the new stylesheet next to the old one and removes
  the old one when it has loaded (a failed load keeps the current theme), inside
  `document.startViewTransition` when supported and `prefers-reduced-motion` is not
  `reduce`; the choice is saved with `submitForm` to the same `/theme` endpoint. The Apply
  button hides after hydration. If saving fails, the page keeps the new look and says so.
- The admin shell is not themed (it keeps the token fallbacks); themes are storefront-only.

## Addendum: no relative colour from tokens outside themes (2026-10-05)

Shared component styles used `oklch(from var(--brand) …)` (the header search button, the home
hero glow, the nav strip fallback). When a theme defines `--brand` with `light-dark()`,
relative colour syntax can't resolve it and the colour is lost (Boutique failed contrast on
13 pages because of it). Rule: outside `src/ui/themes/`, never derive a colour from a token.
Add a dedicated token in `@layer tokens` with a plain fallback and set it in every theme, per
scheme where needed. New tokens: `--search-button-bg`, `--search-button-ink`, `--hero-glow`
(`--nav-bg` now falls back to `--header-bg`). `scripts/check-styles.mjs` enforces the rule.
