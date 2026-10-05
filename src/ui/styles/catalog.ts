// Styles for catalog markup rendered in the light DOM of <main> (cards, grids, hero).
export const catalogCss = `
@layer components {
  .visually-hidden {
    position: absolute; inline-size: 1px; block-size: 1px;
    overflow: hidden; clip-path: inset(50%); white-space: nowrap;
  }
  .button {
    display: inline-block; padding: var(--space-2) var(--space-4);
    background: var(--brand); color: var(--brand-ink);
    border-radius: var(--radius); font-weight: 600; text-decoration: none;
  }
  .hero {
    padding: var(--space-5) var(--space-4);
    border-radius: calc(var(--radius) * 2);
    background:
      radial-gradient(circle at 85% 20%, var(--hero-glow), transparent 50%),
      var(--surface-sunken);
  }
  .hero h1 { font-size: clamp(1.8rem, 1rem + 3vw, 3rem); margin-block: 0 var(--space-2); }
  .card-section { margin-block: var(--space-5); }
  .department-grid {
    list-style: none; padding: 0; margin: 0;
    display: grid; gap: var(--space-3);
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 11rem), 1fr));
  }
  .department-grid a {
    display: block; padding: var(--space-3); text-align: center; font-weight: 600;
    background: var(--surface-raised); border: 1px solid var(--line); border-radius: var(--radius);
    text-decoration: none;
  }
  .department-grid a:hover { border-color: var(--brand); }
  [data-component="department-tile"] { display: grid; gap: var(--space-1); align-content: start; }
  [data-component="department-tile"] a { display: grid; gap: var(--space-2); padding: var(--space-2); }
  [data-component="department-tile"] img {
    inline-size: 100%; block-size: auto; aspect-ratio: 1; object-fit: cover;
    border-radius: var(--radius);
  }
  [data-component="department-tile"] h3 { margin: 0; font-size: 1rem; }
  [data-component="department-tile"] p {
    margin: 0; color: var(--ink-muted); font-size: 0.9rem; text-align: center;
  }
  .card-grid {
    display: grid; gap: var(--space-4);
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 13rem), 1fr));
  }
  .product-card {
    container: card / inline-size;
    display: grid; align-content: start; gap: var(--space-1);
    /* No content-visibility here: card height depends on the column width, so any
       contain-intrinsic-size estimate is wrong somewhere, and skipped cards then overlap their
       neighbours (axe target-size). Listings show at most 24 cards. */
  }
  .product-card > a { text-decoration: none; }
  .product-card > a:hover h3 { text-decoration: underline; }
  .product-card img {
    inline-size: 100%; block-size: auto; aspect-ratio: 1;
    border-radius: var(--radius); background: var(--surface-sunken);
  }
  .product-card h3 { font-size: 1rem; margin-block: var(--space-2) 0; line-height: 1.3; }
  .product-card p { margin: 0; }
  .brand { color: var(--ink-muted); font-size: 0.9rem; }
  .price { font-weight: 700; font-size: 1.1rem; }
  .price.sale ins { color: var(--sale); text-decoration: none; }
  .price.sale del { color: var(--ink-muted); font-weight: 400; font-size: 0.9rem; margin-inline-start: var(--space-1); }
  .rating { display: flex; align-items: center; gap: var(--space-1); font-size: 0.9rem; }
  .stars {
    --pct: calc(var(--rating) / 5 * 100%);
    inline-size: 5.5em; block-size: 1em;
    background: linear-gradient(90deg, var(--rating-fill) var(--pct), var(--line) var(--pct));
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 110 20'%3E%3Cpath d='M10 1l2.6 6 6.4.5-4.9 4.2 1.5 6.3L10 14.6 4.4 18l1.5-6.3L1 7.5l6.4-.5zm22 0l2.6 6 6.4.5-4.9 4.2 1.5 6.3L32 14.6 26.4 18l1.5-6.3L23 7.5l6.4-.5zm22 0l2.6 6 6.4.5-4.9 4.2 1.5 6.3L54 14.6 48.4 18l1.5-6.3L45 7.5l6.4-.5zm22 0l2.6 6 6.4.5-4.9 4.2 1.5 6.3L76 14.6 70.4 18l1.5-6.3L67 7.5l6.4-.5zm22 0l2.6 6 6.4.5-4.9 4.2 1.5 6.3L98 14.6 92.4 18l1.5-6.3L89 7.5l6.4-.5z'/%3E%3C/svg%3E") 0 0 / 100% 100%;
  }
  .count { color: var(--ink-muted); }
  .stock.out { color: var(--sale); font-weight: 600; font-size: 0.9rem; }
}
`;
