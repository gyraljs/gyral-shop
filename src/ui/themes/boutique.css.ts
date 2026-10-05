// "Boutique": an airy, design-led department store (ADR 0006). Inspired by big-box retailers'
// editorial look, with our own name and no third-party marks or assets. White space, a centered
// wordmark above a quiet nav, red used sparingly, large imagery, an editorial home grid,
// image-led cards with no chrome, a product page led by its gallery, and a calm cart and
// checkout. Targets only documented hooks, semantic elements and widget ::parts; writes only to
// @layer theme (checked by test/node/theme-boutique.test.ts).
import type { ThemeDefinition } from './theme.js';

export const boutiqueThemeCss = `
@layer theme {
  :root {
    --font-sans: 'Avenir Next', 'Segoe UI', 'Helvetica Neue', system-ui, sans-serif;
    --font-display: 'Didot', 'Bodoni 72', 'Playfair Display', Georgia, 'Times New Roman', serif;
    --brand: light-dark(oklch(50% 0.2 25), oklch(72% 0.16 25));
    --brand-ink: light-dark(oklch(99% 0 0), oklch(18% 0.01 25));
    --surface: light-dark(oklch(100% 0 0), oklch(16% 0.005 30));
    --surface-raised: light-dark(oklch(100% 0 0), oklch(20% 0.006 30));
    --surface-sunken: light-dark(oklch(97% 0.004 40), oklch(13% 0.005 30));
    --ink: light-dark(oklch(20% 0.01 30), oklch(95% 0.004 40));
    --ink-muted: light-dark(oklch(44% 0.01 30), oklch(75% 0.006 40));
    --line: light-dark(oklch(91% 0.004 40), oklch(30% 0.006 30));
    --line-strong: light-dark(oklch(55% 0.008 30), oklch(62% 0.008 40));
    --danger: light-dark(oklch(48% 0.19 25), oklch(74% 0.15 25));
    --focus: light-dark(oklch(50% 0.2 25), oklch(76% 0.14 25));
    --rating-fill: light-dark(oklch(25% 0.01 30), oklch(90% 0.01 40));
    --shadow-popover: 0 1rem 2.5rem light-dark(oklch(0% 0 0 / 0.08), oklch(0% 0 0 / 0.55));
    --sale: light-dark(oklch(50% 0.2 25), oklch(74% 0.15 25));
    --ok: light-dark(oklch(45% 0.11 160), oklch(76% 0.12 160));
    --radius: 0;
    --space-4: 2rem;
    --space-5: 4rem;
    --page-max: 76rem;
    --step-1: 1.3rem;
    --step-2: 1.8rem;
    --step-3: 2.6rem;
    --brand-size: 1.6rem;
    --header-bg: var(--surface);
    --header-ink: var(--ink);
    --nav-bg: var(--surface);
    --nav-ink: var(--ink);
    --hairline: 1px solid var(--line);
    --tracking-wide: 0.18em;
  }

  body { line-height: 1.65; letter-spacing: 0.01em; }
  main { container: page / inline-size; }
  :is(h1, h2) { font-family: var(--font-display); font-weight: 400; letter-spacing: 0.01em; }

  /* Header: wordmark centered above a quiet, centered department nav. */
  shop-header { border-block-end: var(--hairline); }
  [data-region="masthead"] {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    grid-template-areas: "search brand account";
    align-items: center;
    gap: var(--space-3);
    padding-block: var(--space-4) var(--space-3);
  }
  [data-component="brand"] {
    grid-area: brand;
    justify-self: center;
    font-family: var(--font-display);
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.3em;
  }
  [data-component="brand"] span { color: var(--brand); }
  [data-region="masthead"] shop-search { grid-area: search; justify-self: start; inline-size: min(100%, 18rem); }
  [data-region="account"] { grid-area: account; justify-self: end; align-items: center; font-size: var(--step--1); }
  [data-region="nav"] { border-block-start: var(--hairline); }
  [data-region="nav"] ul { justify-content: center; gap: var(--space-4); padding-block: var(--space-3); }
  [data-region="nav"] a {
    font-size: var(--step--1);
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    text-underline-offset: 0.5em;
  }
  @container header (inline-size < 44rem) {
    [data-region="masthead"] {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: "brand" "search" "account";
      padding-block: var(--space-3) var(--space-2);
    }
    [data-region="masthead"] shop-search { inline-size: 100%; }
    [data-region="account"] { justify-self: center; }
    [data-region="nav"] ul { justify-content: start; gap: var(--space-3); }
  }
  /* The search button is solid ink: a relative colour derived from a light-dark() --brand
     is not reliable, and a quiet ink button suits this theme anyway. */
  [data-region="search"] button { background: var(--ink); color: var(--surface); }
  [data-region="search"] input { border: var(--hairline); }
  shop-mini-cart::part(badge) { background: var(--brand); color: var(--brand-ink); }
  shop-mini-cart::part(panel) { border-radius: 0; }

  /* Home: an editorial hero, then an asymmetric grid of departments and deals. */
  [data-region="hero"] {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: var(--space-2);
    min-block-size: clamp(18rem, 40vb, 30rem);
    padding: var(--space-5) var(--space-4);
    text-align: center;
    background: var(--surface-sunken);
  }
  [data-region="hero"] h1 { font-size: clamp(2.4rem, 1.4rem + 4vw, 4.6rem); line-height: 1.05; max-inline-size: 18ch; }
  [data-region="hero"] p { max-inline-size: 48ch; color: var(--ink-muted); }
  [data-region="hero"] a {
    background: none;
    color: var(--ink);
    padding: var(--space-1) 0;
    border-block-end: 2px solid var(--brand);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    font-size: var(--step--1);
  }
  /* Centered, editorial section titles on the home page only. */
  :is(
      [data-region="departments"],
      [data-region="deals"],
      [data-region="top-rated"],
      [data-region="best-sellers"],
      [data-region="new-arrivals"]
    )
    h2 {
    text-align: center;
    font-size: var(--step-2);
    margin-block-end: var(--space-4);
  }
  [data-region="departments"] ul {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 9rem), 1fr));
    gap: var(--space-4) var(--space-3);
  }
  [data-component="department-tile"] a { border: 0; background: none; padding: 0; }
  [data-component="department-tile"] img { aspect-ratio: 4 / 5; }
  [data-component="department-tile"] h3 {
    font-weight: 400; text-transform: uppercase; letter-spacing: var(--tracking-wide); font-size: var(--step--1);
  }
  @container page (inline-size >= 52rem) {
    [data-region="departments"] ul { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    [data-region="departments"] [data-component="department-tile"]:first-child { grid-column: span 2; grid-row: span 2; }
    [data-region="deals"] section > div { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    [data-region="deals"] [data-component="product-card"]:first-child { grid-column: span 2; grid-row: span 2; }
  }

  /* Cards: image-led, no chrome; a small spaced brand label above a quiet name and price. */
  main div:has(> [data-component="product-card"]) {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 9.5rem), 1fr));
    gap: var(--space-5) var(--space-3);
  }
  [data-component="product-card"] { gap: var(--space-1); }
  [data-component="product-card"] img { aspect-ratio: 4 / 5; object-fit: cover; }
  [data-component="product-card"] h3 { font-weight: 400; font-size: var(--step-0); }
  [data-component="product-card"] > a + p {
    font-size: var(--step--1); text-transform: uppercase; letter-spacing: var(--tracking-wide);
  }
  [data-component="price"] { font-weight: 500; }

  /* Listing: a quiet side column and a roomy grid. */
  [data-region="category"] nav h2 { font-size: var(--step-1); text-align: start; }
  [data-region="listing"] h1 { font-size: var(--step-3); }
  [data-region="filters"] summary { text-transform: uppercase; letter-spacing: var(--tracking-wide); font-size: var(--step--1); }

  /* Product: the gallery leads; the details column stays in view while you scroll. */
  @container page (inline-size >= 52rem) {
    [data-region="product"] { grid-template-columns: minmax(0, 3fr) minmax(18rem, 2fr); gap: var(--space-5); }
    [data-region="product-info"] { position: sticky; inset-block-start: var(--space-4); }
  }
  [data-region="product-info"] h1 { font-size: clamp(1.8rem, 1.2rem + 2vw, 2.8rem); line-height: 1.15; }
  [data-region="specs"] th { font-weight: 500; }
  shop-gallery::part(view) { border-radius: 0; }
  shop-gallery::part(thumb) { border-radius: 0; }
  shop-buy-box::part(add-button) {
    border-radius: 0; inline-size: 100%; text-transform: uppercase; letter-spacing: var(--tracking-wide);
  }

  /* Cart and checkout: calm panels, hairlines instead of boxes. */
  :is([data-region="cart-summary"], [data-component="order-summary"]) {
    background: var(--surface-sunken); border: 0; padding: var(--space-4);
  }
  [data-component="cart-line"] { border-block-end: var(--hairline); }
  [data-component="checkout-step"] { border: 0; border-block-end: var(--hairline); border-radius: 0; }

  /* Footer: centered and quiet. */
  body > footer { text-align: center; border-block-start: var(--hairline); }
  body > footer ul { justify-content: center; gap: var(--space-4); }
}
`;

export const boutiqueTheme: ThemeDefinition = {
  name: 'boutique',
  label: 'Boutique',
  description: 'Airy and minimal: a centered wordmark, editorial layout and red accents.',
  css: boutiqueThemeCss,
};
