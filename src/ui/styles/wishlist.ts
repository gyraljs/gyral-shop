// Wishlist toggle and page (document CSS; theme contract, ADR 0006: tokens only, layered).
export const wishlistCss = `
@layer components {
  .wish-toggle { margin: 0; }
  .wish-toggle button,
  a.wish-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--surface-raised);
    color: var(--ink);
    font: inherit;
    font-size: 0.9rem;
    text-decoration: none;
    cursor: pointer;
    /* WCAG 2.5.8: at least 24px, even inside skipped (content-visibility) cards. */
    min-block-size: 2rem;
    min-inline-size: 2rem;
    justify-self: start;
  }
  .wish-toggle button[aria-pressed='true'] .heart { color: var(--sale); }
  .wish-toggle button:focus-visible,
  a.wish-toggle:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .product-wish { display: block; margin-block-start: var(--space-3); }

  [data-region='wishlist'] .count { color: var(--ink-muted); font-size: 1rem; font-weight: 400; }
  .wishlist {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: var(--space-4);
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr));
  }
  .wishlist > li { display: grid; gap: var(--space-2); align-content: start; }
  .wishlist-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .wishlist-actions form { margin: 0; }
  .wishlist-actions button {
    font: inherit;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius);
    border: 1px solid var(--line-strong);
    background: var(--surface-raised);
    color: var(--ink);
    cursor: pointer;
  }
  .wishlist-actions .primary button {
    background: var(--brand);
    border-color: var(--brand);
    color: var(--brand-ink);
  }
}
`;
