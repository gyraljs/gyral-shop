// Styles for the listing's filter/sort form and results. The listing renders in light DOM
// (Gyral ADR 0014), so these are document styles, loaded by src/server/document.ts.
export const filtersCss = `
@layer components {
  .filters {
    margin-block-start: var(--space-3);
    padding: var(--space-3);
    background: var(--surface-sunken);
    border-radius: var(--radius);
  }
  .filter-fields {
    display: grid; gap: var(--space-3);
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
    align-items: start;
  }
  .filters fieldset { border: 0; padding: 0; margin: 0; min-inline-size: 0; }
  .filters legend, .sort-field label { font-weight: 600; padding: 0; margin-block-end: var(--space-1); }
  .sort-field { margin: 0; display: grid; }
  .sort-field select { padding: var(--space-1) var(--space-2); border-radius: var(--radius); }
  .options { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.15rem; }
  .options label { display: flex; align-items: center; gap: var(--space-1); cursor: pointer; }
  .options .count { color: var(--ink-muted); font-size: 0.9rem; }
  .price-range { display: flex; gap: var(--space-2); }
  .price-field { display: grid; gap: 0.15rem; font-size: 0.9rem; min-inline-size: 0; }
  .money-input { display: flex; align-items: center; gap: 0.2rem; }
  .money-input input { inline-size: 100%; min-inline-size: 4rem; padding: var(--space-1); }
  .filter-actions {
    display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3);
    margin-block: var(--space-3) 0;
  }
  .filter-actions button {
    padding: var(--space-2) var(--space-4); border: 0; border-radius: var(--radius);
    background: var(--brand); color: var(--brand-ink); font-weight: 600; cursor: pointer;
  }
  .results { transition: opacity 150ms; }
  shop-listing { display: block; min-inline-size: 0; }
  shop-listing:state(loading) .results { opacity: 0.55; }
  /* Focus moves to the heading after paging (focusOn): only show a ring for keyboard focus. */
  .listing-header h1:focus:not(:focus-visible) { outline: none; }
  .load-error {
    padding: var(--space-3); border-radius: var(--radius);
    border: 1px solid var(--sale); color: var(--sale);
  }
}
`;
