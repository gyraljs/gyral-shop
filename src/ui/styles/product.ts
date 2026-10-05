// Styles for the product page's light-DOM markup (modern-css skill: layers, logical props).
export const productCss = `
@layer components {
  .product {
    display: grid; gap: var(--space-5);
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
    align-items: start;
  }
  .product-info { display: grid; gap: var(--space-3); align-content: start; }
  .product-info h1 { margin: 0; font-size: clamp(1.5rem, 1rem + 2vw, 2.25rem); line-height: 1.2; text-wrap: balance; }
  .product-info .brand { margin: 0; }
  .rating-summary { display: flex; align-items: center; gap: var(--space-2); margin: 0; }
  .product-section { margin-block: var(--space-5); max-inline-size: 70ch; }
  .product-section p { text-wrap: pretty; }
  .specs { border-collapse: collapse; inline-size: 100%; }
  .specs th, .specs td { text-align: start; padding: var(--space-2) var(--space-3); border-block-end: 1px solid var(--line); }
  .specs th { font-weight: 600; inline-size: 40%; }
  .reviews-summary { display: flex; flex-wrap: wrap; gap: var(--space-5); align-items: center; }
  .average { display: grid; justify-items: start; gap: var(--space-1); margin: 0; }
  .average .big { font-size: 2.5rem; font-weight: 800; line-height: 1; }
  .distribution { display: grid; gap: var(--space-1); margin: 0; min-inline-size: min(100%, 18rem); }
  .distribution div { display: grid; grid-template-columns: 4.5rem 1fr 2.5rem; align-items: center; gap: var(--space-2); }
  .distribution dt { font-size: 0.9rem; }
  .distribution dd { display: contents; }
  .distribution meter { inline-size: 100%; block-size: 0.75rem; }
  .distribution .count { text-align: end; font-variant-numeric: tabular-nums; color: var(--ink-muted); }
  [data-component="review-list"] { list-style: none; padding: 0; display: grid; gap: var(--space-4); }
  [data-component="review-list"][aria-busy="true"] { opacity: 0.6; }
  [data-component="review"] { border-block-start: 1px solid var(--line); padding-block-start: var(--space-3); }
  [data-component="review"] h3 { margin: 0 0 var(--space-1); font-size: 1.05rem; }
  .byline { color: var(--ink-muted); font-size: 0.9rem; margin-block: var(--space-1); }
  [data-component="review-helpful"] {
    display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3);
    color: var(--ink-muted); font-size: 0.9rem;
  }
  [data-component="review-helpful"] form { margin: 0; }
  [data-component="review-helpful"] button {
    font: inherit; padding: var(--space-1) var(--space-3); cursor: pointer;
    border: 1px solid var(--line-strong); border-radius: var(--radius);
    background: var(--surface-raised); color: var(--ink);
  }
  [data-component="review-helpful"] button:disabled { opacity: 0.6; cursor: progress; }
  [data-component="review-cta"] { margin-block: var(--space-3); }
  [data-component="review-notice"]:empty { display: none; }
  [data-component="review-notice"] {
    padding: var(--space-2) var(--space-3); border-inline-start: 4px solid var(--ok);
    background: var(--surface-sunken);
  }
  [data-component="review-notice"].error { border-inline-start-color: var(--danger); }
  [data-component="review-sort"] ul {
    list-style: none; padding: 0; margin: var(--space-3) 0; display: flex; gap: var(--space-3);
  }
  [data-component="review-sort"] a[aria-current] { font-weight: 700; text-decoration-thickness: 2px; }
  #reviews-title:focus:not(:focus-visible) { outline: none; }
  .review-pager { display: flex; gap: var(--space-3); align-items: center; margin-block: var(--space-4); }
}
`;
