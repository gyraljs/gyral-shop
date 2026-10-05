// Document styles for <shop-search> (light DOM; theme contract ADR 0006: tokens only, layered).
// The suggestion list sits under the field, absolutely positioned in the combo box; narrow
// lists stack each suggestion's detail under its name (container query).
export const searchCss = `
@layer components {
  shop-search { display: block; flex: 1 1 18rem; min-inline-size: 0; }
  shop-search form { display: flex; position: relative; }
  shop-search .combo { flex: 1; position: relative; display: flex; min-inline-size: 0; }
  shop-search .keys { display: flex; flex: 1; min-inline-size: 0; }
  shop-search input {
    flex: 1;
    min-inline-size: 0;
    font: inherit;
    padding: var(--space-2) var(--space-3);
    border: 0;
    border-start-start-radius: var(--radius);
    border-end-start-radius: var(--radius);
    background: var(--surface-raised);
    color: var(--ink);
  }
  shop-search button {
    font: inherit;
    font-weight: 600;
    padding-inline: var(--space-3);
    border: 0;
    border-start-end-radius: var(--radius);
    border-end-end-radius: var(--radius);
    background: oklch(from var(--brand) calc(l - 0.15) c h);
    color: var(--brand-ink);
    cursor: pointer;
  }
  shop-search [role='listbox'] {
    position: absolute;
    inset-block-start: 100%;
    inset-inline: 0;
    z-index: 20;
    margin: var(--space-1) 0 0;
    padding: var(--space-1);
    list-style: none;
    background: var(--surface-raised);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow-popover);
    max-block-size: min(24rem, 60dvb);
    overflow-y: auto;
    container: search-suggestions / inline-size;
  }
  shop-search [role='listbox'][hidden] { display: none; }
  shop-search [role='option'] {
    display: grid;
    gap: 0 var(--space-2);
    grid-template-columns: 1fr auto;
    padding: var(--space-2);
    border-radius: var(--radius);
    cursor: pointer;
  }
  shop-search [role='option'] .detail { color: var(--ink-muted); font-size: 0.875rem; }
  shop-search [role='option'][data-kind='category'] .label { font-weight: 600; }
  shop-search [role='option']:hover,
  shop-search [role='option'][aria-selected='true'] { background: var(--surface-sunken); }
  shop-search [role='option'][aria-selected='true'] { outline: 2px solid var(--focus); }

  @container search-suggestions (inline-size < 26rem) {
    shop-search [role='option'] { grid-template-columns: 1fr; }
  }
}
`;
