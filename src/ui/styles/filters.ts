// Styles for the <shop-listing> shadow root. Document styles don't cross the shadow boundary
// (tokens do: they are inherited custom properties), so the element-level base rules the
// listing relies on are repeated here, then the catalog/listing component layers are reused.
export const shadowBaseCss = `
@layer reset, base, components;
@layer reset {
  *, *::before, *::after { box-sizing: border-box; }
  img, svg { display: block; max-inline-size: 100%; }
}
@layer base {
  :host { display: block; min-inline-size: 0; }
  a { color: inherit; }
  :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  h1, h2 { line-height: 1.2; text-wrap: balance; }
  h1:focus { outline: none; }
  h1:focus-visible { outline: 2px solid var(--focus); }
  p { text-wrap: pretty; }
  button, input, select { font: inherit; }
}
`;

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
  :host(:state(loading)) .results { opacity: 0.55; }
  .load-error {
    padding: var(--space-3); border-radius: var(--radius);
    border: 1px solid var(--sale); color: var(--sale);
  }
}
`;
