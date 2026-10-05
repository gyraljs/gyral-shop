// Checkout styles (shadow root of <shop-checkout>; tokens come from the document's :root).
// Theme contract: docs/design-docs/0006-theming.md (tokens only, layered, parts exposed).
export const checkoutCss = `
@layer reset, tokens, base, components, theme;
@layer components {
  :host { container: checkout / inline-size; }
  h1 { margin-block: var(--space-3) var(--space-2); }
  .layout { display: grid; gap: var(--space-4); grid-template-columns: minmax(0, 1fr); }
  @container checkout (min-width: 56rem) {
    .layout { grid-template-columns: minmax(0, 1fr) 20rem; align-items: start; }
    .order-summary { position: sticky; inset-block-start: var(--space-3); }
  }
  .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-3); }
  .step {
    padding: var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-raised);
  }
  .step.open { border-color: var(--line-strong); }
  .step.locked { background: var(--surface-sunken); color: var(--ink-muted); }
  .step h2 { font-size: 1.1rem; margin: 0 0 var(--space-2); }
  .step.locked h2 { margin: 0; }
  .number { color: var(--ink-muted); }
  .locked { margin: 0; font-size: 0.9rem; }
  .step.locked .locked { display: none; }
  .step-summary { display: flex; justify-content: space-between; gap: var(--space-3); align-items: start; }
  .step-summary p, .step-summary address { margin: 0; font-style: normal; }
  form { display: grid; gap: var(--space-2); }
  fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
  legend { font-weight: 600; padding: 0; margin-block-end: var(--space-1); }
  .field { display: grid; gap: var(--space-1); margin: 0; }
  .row { display: grid; gap: var(--space-2); grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); }
  input:not([type='radio'], [type='checkbox']), select {
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink);
  }
  input[aria-invalid='true'], input:user-invalid { border-color: var(--danger); }
  .error { color: var(--danger); font-size: 0.9rem; }
  .error:empty { display: none; }
  .hint { color: var(--ink-muted); font-size: 0.9rem; margin: 0; }
  .choice {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: var(--space-1) var(--space-2);
    align-items: center;
    padding: var(--space-2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    cursor: pointer;
  }
  .choice:has(input:checked) { border-color: var(--brand); background: var(--surface-sunken); }
  .choice .estimate { grid-column: 2; color: var(--ink-muted); font-size: 0.9rem; }
  .choice .amount { grid-row: 1; grid-column: 3; font-weight: 600; }
  button.primary {
    justify-self: start;
    padding: var(--space-2) var(--space-4);
    border: 0;
    border-radius: var(--radius);
    background: var(--brand);
    color: var(--brand-ink);
    font-weight: 700;
    cursor: pointer;
  }
  button.primary:disabled { opacity: 0.6; cursor: progress; }
  .order-summary {
    padding: var(--space-3);
    border-radius: var(--radius);
    background: var(--surface-sunken);
  }
  .order-summary h2 { font-size: 1.1rem; margin: 0 0 var(--space-2); }
  .summary-lines { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
  .summary-lines li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0 var(--space-2); }
  .summary-lines .options { grid-column: 1; color: var(--ink-muted); font-size: 0.85rem; }
  .summary-lines .amount { grid-row: 1; grid-column: 2; font-variant-numeric: tabular-nums; }
  .totals { margin: var(--space-3) 0 0; display: grid; gap: var(--space-1); }
  .totals div { display: flex; justify-content: space-between; gap: var(--space-2); }
  .totals dd { margin: 0; font-variant-numeric: tabular-nums; }
  .totals .discount dd { color: var(--sale); }
  .totals .total { border-block-start: 1px solid var(--line-strong); padding-block-start: var(--space-2); font-weight: 700; }
  .visually-hidden {
    position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden;
    clip-path: inset(50%); white-space: nowrap;
  }
}
`;
