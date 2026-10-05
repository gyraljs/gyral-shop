// Order confirmation styles (light DOM inside <main>). Tokens only: docs/design-docs/0006.
export const ordersCss = `
@layer components {
  .confirmation {
    container: confirmation / inline-size;
    display: grid;
    gap: var(--space-4);
    max-inline-size: 48rem;
  }
  .confirmation h1, .confirmation h2 { margin-block: 0; }
  .confirmation header { display: grid; gap: var(--space-2); }
  .confirmation header p { margin: 0; }
  .confirmation section {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-raised);
  }
  .confirmation address { font-style: normal; }
  .order-lines { inline-size: 100%; border-collapse: collapse; }
  .order-lines th, .order-lines td {
    padding-block: var(--space-1);
    text-align: start;
    border-block-end: 1px solid var(--line);
  }
  .order-lines td { text-align: end; }
  .order-lines thead th:not(:first-child) { text-align: end; }
  .order-lines small { color: var(--ink-muted); }
  .confirmation .totals dl { margin: 0; display: grid; gap: var(--space-1); }
  .confirmation .row { display: flex; justify-content: space-between; gap: var(--space-3); }
  .confirmation .row dd { margin: 0; font-variant-numeric: tabular-nums; }
  .confirmation .row.total { font-weight: 700; border-block-start: 1px solid var(--line-strong); padding-block-start: var(--space-1); }
  .confirmation .totals p { margin: 0; color: var(--ink-muted); }
  @container confirmation (inline-size < 30rem) {
    .order-lines thead th:nth-child(3), .order-lines td:nth-child(3) { display: none; }
  }
}
`;
