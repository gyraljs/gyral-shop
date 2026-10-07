// "Supercenter" theme (ADR 0006): friendly and roomy, inspired by big-box supercenters — a bright
// blue header with a pill-shaped search, yellow call-to-action buttons, generous spacing and big
// rounded cards that lead with the price. Our own name; no third-party logos or brand assets.
// It writes only to @layer theme and targets only documented hooks (data-region, data-component,
// documented ::part()s, component tags) and semantic elements: test/node/themes-contract.test.ts checks.
import type { ThemeDefinition } from './theme.js';

export const supercenterThemeCss = `
@layer theme {
  :root {
    --font-sans: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    --font-display: var(--font-sans);
    --brand: light-dark(oklch(48% 0.17 255), oklch(72% 0.13 250));
    --brand-ink: light-dark(oklch(99% 0 0), oklch(18% 0.04 255));
    --surface: light-dark(oklch(97% 0.008 250), oklch(17% 0.02 255));
    --surface-raised: light-dark(oklch(100% 0 0), oklch(23% 0.025 255));
    --surface-sunken: light-dark(oklch(94% 0.015 250), oklch(14% 0.02 255));
    --ink: light-dark(oklch(21% 0.035 255), oklch(95% 0.01 250));
    --ink-muted: light-dark(oklch(42% 0.03 255), oklch(80% 0.02 250));
    --line: light-dark(oklch(88% 0.02 250), oklch(34% 0.03 255));
    --line-strong: light-dark(oklch(58% 0.03 255), oklch(60% 0.03 250));
    --danger: light-dark(oklch(48% 0.19 25), oklch(76% 0.14 25));
    --focus: light-dark(oklch(48% 0.17 255), oklch(80% 0.13 90));
    --rating-fill: light-dark(oklch(72% 0.17 75), oklch(84% 0.16 85));
    --sale: light-dark(oklch(44% 0.14 150), oklch(80% 0.15 150));
    --ok: light-dark(oklch(44% 0.14 150), oklch(80% 0.15 150));
    --shadow-popover: 0 0.75rem 2rem light-dark(oklch(25% 0.08 255 / 0.18), oklch(0% 0 0 / 0.55));
    --radius: 0.9rem;
    --brand-size: 1.6rem;
    --space-3: 1.125rem;
    --space-4: 1.75rem;
    --space-5: 3rem;
    --step-1: 1.3rem;
    --step-2: 1.65rem;
    --step-3: 2.25rem;
    --header-bg: light-dark(oklch(48% 0.17 255), oklch(28% 0.09 255));
    --header-ink: oklch(99% 0 0);
    --nav-bg: light-dark(oklch(41% 0.15 255), oklch(23% 0.07 255));
    --nav-ink: oklch(99% 0 0);
    --search-button-bg: light-dark(oklch(33% 0.17 255), oklch(85% 0.15 95));
    --search-button-ink: light-dark(oklch(99% 0 0), oklch(20% 0.04 255));
    --hero-glow: light-dark(oklch(48% 0.17 255 / 0.25), oklch(72% 0.13 250 / 0.25));
    /* Theme tokens: the yellow call to action, pills and card elevation. */
    --cta: oklch(86% 0.17 90);
    --cta-hover: oklch(81% 0.17 85);
    --cta-ink: oklch(21% 0.05 255);
    --pill: 999rem;
    --card-radius: 1.25rem;
    --card-shadow: 0 0.25rem 1rem light-dark(oklch(25% 0.08 255 / 0.1), oklch(0% 0 0 / 0.45));
  }

  /* Header: brand, a wide pill search and the account/cart utility on one row; the search drops
     to its own full-width row when the header is narrow. */
  [data-region="masthead"] {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas: "brand search account";
    align-items: center;
    gap: var(--space-3);
    padding-block: var(--space-3);
  }
  [data-region="masthead"] > [data-component="brand"] { grid-area: brand; letter-spacing: -0.03em; }
  [data-region="masthead"] > shop-search { grid-area: search; }
  [data-region="masthead"] > [data-region="account"] { grid-area: account; align-items: center; }
  @container header (inline-size < 44rem) {
    [data-region="masthead"] {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: "brand account" "search search";
    }
    [data-region="masthead"] > [data-component="brand"] { font-size: var(--step-1); white-space: nowrap; }
  }
  [data-region="search"] input {
    padding-block: var(--space-2);
    padding-inline: var(--space-4) var(--space-3);
    border-start-start-radius: var(--pill);
    border-end-start-radius: var(--pill);
  }
  [data-region="search"] button {
    padding-inline: var(--space-4);
    border-start-end-radius: var(--pill);
    border-end-end-radius: var(--pill);
    background: var(--cta);
    color: var(--cta-ink);
  }
  [data-region="search"] button:hover { background: var(--cta-hover); }

  /* Department nav as rounded chips; the current department is filled yellow. */
  [data-region="nav"] ul { gap: var(--space-2); padding-block: var(--space-2); }
  [data-region="nav"] a {
    display: inline-block;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--pill);
    background: oklch(from var(--nav-ink) l c h / 0.12);
  }
  [data-region="nav"] a:is(:hover, [aria-current]) { text-decoration: none; }
  [data-region="nav"] a:hover { background: oklch(from var(--nav-ink) l c h / 0.22); }
  [data-region="nav"] a[aria-current] { background: var(--cta); color: var(--cta-ink); }

  /* Home: a big rounded blue hero with a yellow pill button. */
  [data-region="hero"] {
    padding: var(--space-5);
    border-radius: calc(var(--card-radius) * 1.5);
    background:
      radial-gradient(circle at 90% 10%, oklch(from var(--cta) l c h / 0.35), transparent 45%),
      var(--header-bg);
    color: var(--header-ink);
  }
  [data-region="hero"] a {
    display: inline-block;
    padding: var(--space-2) var(--space-4);
    border-radius: var(--pill);
    background: var(--cta);
    color: var(--cta-ink);
    font-weight: 700;
  }
  [data-region="hero"] a:focus-visible { outline-color: var(--header-ink); }

  /* Chunky round department tiles. */
  [data-region="departments"] ul {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 9.5rem), 1fr));
    gap: var(--space-4) var(--space-3);
  }
  [data-component="department-tile"] a {
    border: 0;
    background: none;
    padding: 0;
    justify-items: center;
  }
  [data-component="department-tile"] img {
    inline-size: min(100%, 9rem);
    border-radius: 50%;
    border: 0.3rem solid var(--surface-raised);
    box-shadow: var(--card-shadow);
  }
  [data-component="department-tile"] a:hover img { border-color: var(--cta); }
  [data-component="department-tile"] h3 { font-size: var(--step-0); font-weight: 700; text-align: center; }

  /* Today's deals sits on a soft yellow band. */
  [data-region="deals"] {
    padding: var(--space-2) var(--space-4) var(--space-4);
    border-radius: calc(var(--card-radius) * 1.5);
    background: light-dark(oklch(96% 0.05 92), oklch(26% 0.04 90));
  }

  /* Product cards: raised, rounded, and price first under the title. */
  [data-component="product-card"] {
    padding: var(--space-3);
    border-radius: var(--card-radius);
    background: var(--surface-raised);
    box-shadow: var(--card-shadow);
    gap: var(--space-2);
  }
  [data-component="product-card"] > a { order: 0; }
  [data-component="product-card"] > [data-component="price"] { order: 1; }
  [data-component="product-card"] > [data-component="rating"] { order: 2; }
  [data-component="product-card"] > p { order: 3; }
  [data-component="product-card"] > shop-wish-toggle { order: 4; }
  [data-component="product-card"] img { border-radius: calc(var(--card-radius) - var(--space-2)); }
  [data-component="price"] { font-size: var(--step-1); font-weight: 800; letter-spacing: -0.01em; }
  [data-component="price"] ins { color: var(--sale); }

  /* Buttons and pagers are pills; the main actions are yellow. */
  main button { border-radius: var(--pill); }
  [data-component="pager"] a { border-radius: var(--pill); }
  :is([data-component="checkout-link"], [data-component="place-order"] button) {
    border-radius: var(--pill);
    background: var(--cta);
    color: var(--cta-ink);
    font-weight: 700;
  }
  :is([data-component="checkout-link"], [data-component="place-order"] button):hover {
    background: var(--cta-hover);
  }
  [data-component="checkout-link"]:disabled {
    background: var(--surface-sunken);
    color: var(--ink-muted);
  }
  [data-region="buy-box"]::part(add-button) {
    border-radius: var(--pill);
    background: var(--cta);
    color: var(--cta-ink);
    font-weight: 700;
  }
  [data-region="buy-box"]::part(price) { font-size: var(--step-3); }
  [data-region="buy-box"]::part(option) { border-radius: var(--pill); }

  /* Filters and the product buy box are cards. */
  [data-region="filters"],
  [data-region="buy-box"],
  [data-region="cart-summary"],
  [data-component="order-summary"] {
    padding: var(--space-3);
    border-radius: var(--card-radius);
    background: var(--surface-raised);
    box-shadow: var(--card-shadow);
  }
  [data-region="buy-box"] { border-block-start: 0.35rem solid var(--brand); }
  @media (width >= 60rem) {
    [data-region="buy-box"] { position: sticky; inset-block-start: var(--space-3); }
  }

  /* Roomy cart and checkout: each line and step is its own card. */
  [data-component="cart-line"] {
    padding: var(--space-3);
    border: 0;
    border-radius: var(--card-radius);
    background: var(--surface-raised);
    box-shadow: var(--card-shadow);
  }
  /* The roomier card leaves a phone too little width for quantity and Remove side by side:
     stack the line (the default areas are thumb, details, total, quantity, remove). */
  @container cart (inline-size < 34rem) {
    [data-component="cart-line"] {
      grid-template-columns: 4rem minmax(0, 1fr);
      grid-template-areas: "thumb details" "thumb total" "quantity quantity" "remove remove";
    }
  }
  [data-component="checkout-step"] { border-radius: var(--card-radius); border-width: 0; box-shadow: var(--card-shadow); }

  /* A deep blue footer. */
  body > footer {
    background: var(--nav-bg);
    color: var(--nav-ink);
    border-block-start: 0;
  }
  body > footer input { accent-color: var(--cta); }
}
`;

export const supercenterTheme: ThemeDefinition = {
  name: 'supercenter',
  label: 'Supercenter',
  description: 'Friendly and roomy: bright blue header, yellow buttons, big rounded cards.',
  css: supercenterThemeCss,
};
