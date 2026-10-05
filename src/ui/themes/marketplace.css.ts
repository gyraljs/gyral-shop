// Marketplace: a dense, information-first look inspired by big online marketplaces (ADR 0006).
// Our own name and palette; no third-party logos, names or brand assets.
// - A dark navy masthead dominated by a full-width search bar, a slimmer nav strip below.
// - An orange accent for primary actions, the cart badge and current-page markers.
// - Compact product cards: smaller images, tighter type, star ratings above the price.
// - Category and search pages put the category nav and filters in a left rail on wide screens.
// - Product pages use three columns on wide screens: gallery, details, a boxed buy box.
// Targets only documented hooks (data-region, data-component, landmarks, ::part names) and
// writes only to @layer theme (test/node/theme-marketplace.test.ts).
import type { ThemeDefinition } from './theme.js';

export const marketplaceThemeCss = `
@layer theme {
  :root {
    --font-sans: 'Helvetica Neue', Arial, system-ui, sans-serif;
    --font-display: var(--font-sans);
    /* Orange accent with dark ink: AA in both schemes. */
    --brand: oklch(77% 0.16 65);
    --brand-ink: oklch(18% 0.03 250);
    --surface: light-dark(oklch(96.5% 0.004 250), oklch(16% 0.018 255));
    --surface-raised: light-dark(oklch(100% 0 0), oklch(21% 0.02 255));
    --surface-sunken: light-dark(oklch(93.5% 0.006 250), oklch(13% 0.016 255));
    --ink: light-dark(oklch(20% 0.02 255), oklch(94% 0.008 255));
    --ink-muted: light-dark(oklch(42% 0.02 255), oklch(76% 0.015 255));
    --line: light-dark(oklch(86% 0.008 255), oklch(33% 0.02 255));
    --line-strong: light-dark(oklch(58% 0.015 255), oklch(56% 0.015 255));
    --danger: light-dark(oklch(47% 0.18 28), oklch(76% 0.14 28));
    --focus: light-dark(oklch(55% 0.17 230), oklch(75% 0.14 230));
    --rating-fill: light-dark(oklch(72% 0.17 65), oklch(80% 0.15 70));
    --shadow-popover: 0 0.25rem 0.75rem light-dark(oklch(0% 0 0 / 0.18), oklch(0% 0 0 / 0.55));
    --sale: light-dark(oklch(48% 0.17 35), oklch(80% 0.14 55));
    --ok: light-dark(oklch(45% 0.13 150), oklch(78% 0.14 150));
    --link: light-dark(oklch(44% 0.1 230), oklch(80% 0.09 220));
    --radius: 0.25rem;
    /* Denser spacing and type than the default. */
    --space-1: 0.2rem;
    --space-2: 0.4rem;
    --space-3: 0.75rem;
    --space-4: 1rem;
    --space-5: 1.75rem;
    --page-max: 96rem;
    --step--1: 0.8125rem;
    --step-0: 0.9375rem;
    --step-1: 1.125rem;
    --step-2: 1.375rem;
    --step-3: 1.75rem;
    --brand-size: 1.3rem;
    --header-bg: oklch(24% 0.045 255);
    --header-ink: oklch(98% 0 0);
    --nav-bg: oklch(31% 0.05 255);
    --nav-ink: oklch(98% 0 0);
  }

  body { font-size: var(--step-0); line-height: 1.4; }
  h1 { font-size: var(--step-3); }
  h2 { font-size: var(--step-2); }

  /* Masthead: brand, a dominant search bar, account and cart. Full width, not page width. */
  [data-region="masthead"] {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas: "brand search account";
    align-items: center;
    gap: var(--space-2) var(--space-4);
    inline-size: auto;
    margin-inline: 0;
    padding: var(--space-2) var(--space-4);
  }
  [data-component="brand"] { grid-area: brand; letter-spacing: -0.01em; }
  shop-search { grid-area: search; }
  [data-region="masthead"] > [data-region="account"] { grid-area: account; align-items: center; }
  @container header (inline-size < 48rem) {
    [data-region="masthead"] {
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-areas: "brand account" "search search";
      padding-inline: var(--space-3);
    }
    [data-region="masthead"] > [data-region="account"] { justify-self: end; }
  }
  [data-region="search"] input {
    min-block-size: 2.5rem;
    border-radius: var(--radius) 0 0 var(--radius);
    background: oklch(100% 0 0);
    color: oklch(18% 0.02 255);
  }
  [data-region="search"] button[type="submit"] {
    min-inline-size: 3rem;
    background: var(--brand);
    color: var(--brand-ink);
  }
  [data-region="nav"] { font-size: var(--step--1); }
  [data-region="nav"] ul {
    inline-size: auto;
    margin-inline: 0;
    padding: var(--space-2) var(--space-4);
    gap: var(--space-4);
  }
  [data-region="nav"] a[aria-current] { text-decoration-color: var(--brand); text-decoration-thickness: 2px; }
  shop-mini-cart::part(badge) { background: var(--brand); color: var(--brand-ink); font-weight: 700; }

  /* Page width: wider and denser. */
  main { padding-block: var(--space-3); }

  /* Home: a navy promo band and compact department tiles. */
  [data-region="hero"] {
    border-radius: 0;
    background: linear-gradient(135deg, var(--header-bg), var(--nav-bg));
    color: var(--header-ink);
    padding: var(--space-5) var(--space-4);
  }
  [data-region="hero"] a { background: var(--brand); color: var(--brand-ink); border-radius: var(--radius); }
  [data-region="hero"] a:focus-visible { outline-color: var(--header-ink); }
  [data-region="departments"] ul { grid-template-columns: repeat(auto-fill, minmax(min(100%, 8.5rem), 1fr)); gap: var(--space-2); }
  [data-component="department-tile"] a { background: var(--surface-raised); border-radius: var(--radius); }
  [data-component="department-tile"] h3 { font-size: var(--step--1); }
  [data-component="department-tile"] p { font-size: var(--step--1); }

  /* Product cards: small image, three-line title in link colour, rating above the price. */
  main :is(section, div) > div:has(> [data-component="product-card"]) {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 10rem), 1fr));
    gap: var(--space-4) var(--space-3);
  }
  [data-component="product-card"] {
    gap: var(--space-1);
    padding: var(--space-2);
    background: var(--surface-raised);
    border-radius: var(--radius);
  }
  [data-component="product-card"] img { border-radius: 0; aspect-ratio: 1; object-fit: contain; background: var(--surface-raised); }
  [data-component="product-card"] h3 {
    font-size: var(--step--1);
    font-weight: 500;
    color: var(--link);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow: hidden;
  }
  [data-component="product-card"] > [data-component="rating"] { order: 1; font-size: var(--step--1); }
  [data-component="product-card"] > [data-component="price"] { order: 2; font-size: var(--step-1); }
  [data-component="product-card"] > shop-wish-toggle { order: 3; }
  [data-component="price"] ins { color: var(--sale); }

  /* Category and search: category nav and filters in a left rail on wide screens. */
  @media (width >= 56rem) {
    [data-region="category"]:has(> shop-listing) {
      grid-template-columns: 15rem minmax(0, 1fr);
      grid-template-rows: auto auto 1fr auto;
      gap: var(--space-3) var(--space-5);
    }
    [data-region="category"] > shop-listing,
    [data-region="category"] > shop-listing > [data-region="listing"] { display: contents; }
    [data-region="category"] > [data-region="listing-nav"] { grid-column: 1; grid-row: 1 / 3; }
    [data-region="category"] [data-region="listing"] > header { grid-column: 2; grid-row: 1; }
    [data-region="category"] [data-region="filters"] { grid-column: 1; grid-row: 3; align-self: start; }
    [data-region="category"] [data-region="results"] { grid-column: 2; grid-row: 2 / 4; }
    [data-region="category"] [data-region="listing"] > [data-component="pager"] { grid-column: 2; grid-row: 4; }

    main > shop-listing > [data-region="listing"] {
      display: grid;
      grid-template-columns: 15rem minmax(0, 1fr);
      grid-template-rows: auto auto 1fr auto;
      gap: var(--space-3) var(--space-5);
    }
    main > shop-listing > [data-region="listing"] > header { grid-column: 2; grid-row: 1; }
    main > shop-listing [data-region="filters"] { grid-column: 1; grid-row: 1 / 4; align-self: start; }
    main > shop-listing [data-region="results"] { grid-column: 2; grid-row: 2 / 4; }
    main > shop-listing > [data-region="listing"] > [data-component="pager"] { grid-column: 2; grid-row: 4; }

    /* In the rail the filters are always expanded (no toggle). */
    [data-region="filters"] { margin: 0; padding: 0; background: none; }
    @supports selector(::details-content) {
      [data-component="filters-panel"] > summary { display: none; }
      [data-component="filters-panel"]::details-content { content-visibility: visible; block-size: auto; }
    }
    [data-region="filters"] fieldset { padding-block-start: var(--space-3); border-block-start: 1px solid var(--line); }
  }
  [data-region="listing-nav"] h2 { font-size: var(--step-0); }
  [data-region="listing-nav"] { font-size: var(--step--1); }
  [data-region="listing"] > header { border-block-end: 1px solid var(--line); padding-block-end: var(--space-2); }
  [data-region="listing"] > header h1 { font-size: var(--step-2); }
  [data-region="filters"] { font-size: var(--step--1); }
  [data-region="filters"] button[type="submit"] { background: var(--brand); color: var(--brand-ink); }
  [data-component="pager"] a[aria-current] { background: var(--brand); border-color: var(--brand); color: var(--brand-ink); }

  /* Product page: gallery, details and a boxed buy box in three columns on wide screens. */
  @media (width >= 64rem) {
    /* Details stack in auto rows; a final 1fr row absorbs the tall gallery and buy box, so the
       details keep their natural spacing (spanning items size flexible tracks first). */
    [data-region="product"] {
      grid-template-columns: minmax(0, 5fr) minmax(0, 4fr) 17rem;
      grid-template-rows: repeat(4, auto) 1fr;
      gap: var(--space-2) var(--space-5);
    }
    [data-region="gallery"] { grid-column: 1; grid-row: 1 / -1; }
    [data-region="product-info"] { display: contents; }
    [data-region="product-info"] > * { grid-column: 2; align-self: start; }
    [data-region="product-info"] > [data-region="buy-box"] { grid-column: 3; grid-row: 1 / -1; }
  }
  [data-region="product-info"] h1 { font-size: var(--step-2); font-weight: 500; }
  [data-region="buy-box"] {
    align-self: start;
    padding: var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-raised);
  }
  shop-buy-box::part(add-button) {
    inline-size: 100%;
    border-radius: 999px;
    background: var(--brand);
    color: var(--brand-ink);
  }
  shop-buy-box::part(price) { color: var(--sale); }
  shop-gallery::part(thumb) { border-radius: var(--radius); }
  [data-region="description"], [data-region="specs"] { max-inline-size: none; }
  [data-region="reviews"] { max-inline-size: none; border-block-start: 1px solid var(--line); padding-block-start: var(--space-4); }

  /* Cart: lines on a white panel, a boxed summary with the orange checkout button. */
  [data-region="cart-lines"] { padding: var(--space-3); background: var(--surface-raised); border-radius: var(--radius); }
  [data-region="cart-summary"] { padding: var(--space-3); background: var(--surface-raised); border: 1px solid var(--line); border-radius: var(--radius); }
  [data-component="checkout-link"] { background: var(--brand); border-color: var(--brand); color: var(--brand-ink); border-radius: 999px; }

  /* Checkout: utilitarian — flat numbered sections, a boxed summary, an orange Place order. */
  [data-component="checkout-step"] { border-radius: 0; border-inline: 0; border-block-start-width: 2px; background: none; }
  [data-component="order-summary"] { background: var(--surface-raised); border: 1px solid var(--line); border-radius: var(--radius); }
  [data-component="place-order"] button, button[data-component="place-order"] {
    background: var(--brand);
    color: var(--brand-ink);
    border-radius: 999px;
  }

  /* Footer: dark navy band, like the masthead. */
  body > footer { background: var(--header-bg); color: var(--header-ink); border: 0; }
  body > footer a { color: var(--header-ink); }
  body > footer :focus-visible { outline-color: var(--header-ink); }
  [data-region="theme-switcher"] input { accent-color: var(--brand); }
}
`;

export const marketplaceTheme: ThemeDefinition = {
  name: 'marketplace',
  label: 'Marketplace',
  description: 'Dense and information-first: navy masthead with a big search bar, orange accents.',
  css: marketplaceThemeCss,
};
