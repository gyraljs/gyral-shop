// Shadow styles for <shop-buy-box>. A plain string so it can be shared and tested.
export const buyBoxCss = `
:host { display: grid; gap: var(--space-3); }
p { margin: 0; }
.price { font-size: 1.6rem; font-weight: 800; }
.price.sale ins { color: var(--sale); text-decoration: none; }
.price.sale del {
  color: var(--ink-muted); font-weight: 400; font-size: 1rem;
  margin-inline-start: var(--space-2);
}
.stock { font-weight: 600; color: var(--ok); }
.stock.out { color: var(--sale); }
.stock .label { font-weight: 400; color: var(--ink-muted); }
form { display: grid; gap: var(--space-3); }
.choices {
  border: 1px solid var(--line); border-radius: var(--radius);
  padding: var(--space-2) var(--space-3); margin: 0;
  display: flex; flex-wrap: wrap; gap: var(--space-2);
}
.choices legend { padding-inline: var(--space-1); }
.sku { flex: 1 1 100%; display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: baseline; }
.sku .meta { color: var(--ink-muted); font-size: 0.9rem; }
.option {
  position: relative; display: inline-grid; justify-items: center;
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--line); border-radius: var(--radius); cursor: pointer;
}
.option input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.option:has(input:checked) { border-color: var(--brand); box-shadow: inset 0 0 0 1px var(--brand); }
.option:has(input:focus-visible) { outline: 3px solid var(--focus, var(--brand)); outline-offset: 2px; }
.option:has(input:disabled) { opacity: 0.6; cursor: not-allowed; }
.option:has(input:disabled) > span { text-decoration: line-through; }
.option small { font-size: 0.75rem; color: var(--ink-muted); }
.quantity { display: flex; align-items: center; gap: var(--space-2); }
.quantity input { inline-size: 5rem; font: inherit; padding: var(--space-1) var(--space-2); }
button {
  font: inherit; font-weight: 700; padding: var(--space-2) var(--space-4);
  border: 0; border-radius: var(--radius);
  background: var(--brand); color: var(--brand-ink); cursor: pointer;
  justify-self: start;
}
button:disabled { background: var(--line); color: var(--ink-muted); cursor: not-allowed; }
button:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.visually-hidden {
  position: absolute; inline-size: 1px; block-size: 1px;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap;
}
.added:empty { display: none; }
.added {
  margin-block: var(--space-2) 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  background: var(--surface-sunken);
  border-inline-start: 4px solid var(--ok);
}
.added.error { border-inline-start-color: var(--danger); }
`;
