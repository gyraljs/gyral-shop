// Order pages (confirmation, history, detail, lookup): light DOM inside <main>.
// Tokens only: docs/design-docs/0006-theming.md.
export const ordersCss = `
@layer components {
  .confirmation, .order-page {
    container: confirmation / inline-size;
    display: grid;
    gap: var(--space-4);
    max-inline-size: 48rem;
  }
  :is(.confirmation, .order-page) :is(h1, h2) { margin-block: 0; }
  :is(.confirmation, .order-page) header { display: grid; gap: var(--space-2); }
  :is(.confirmation, .order-page) header p { margin: 0; }
  :is(.confirmation, .order-page) section {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-raised);
  }
  :is(.confirmation, .order-page) address { font-style: normal; }
  .order-lines { inline-size: 100%; border-collapse: collapse; }
  .order-lines th, .order-lines td {
    padding-block: var(--space-1);
    text-align: start;
    border-block-end: 1px solid var(--line);
  }
  .order-lines td { text-align: end; }
  .order-lines thead th:not(:first-child) { text-align: end; }
  .order-lines small { color: var(--ink-muted); }
  :is(.confirmation, .order-page) .totals dl { margin: 0; display: grid; gap: var(--space-1); }
  :is(.confirmation, .order-page) .row { display: flex; justify-content: space-between; gap: var(--space-3); }
  :is(.confirmation, .order-page) .row dd { margin: 0; font-variant-numeric: tabular-nums; }
  :is(.confirmation, .order-page) .row.total { font-weight: 700; border-block-start: 1px solid var(--line-strong); padding-block-start: var(--space-1); }
  :is(.confirmation, .order-page) .totals p { margin: 0; color: var(--ink-muted); }
  @container confirmation (inline-size < 30rem) {
    .order-lines thead th:nth-child(3), .order-lines td:nth-child(3) { display: none; }
  }
  .order-page .row.refunded { color: var(--ok); }
  .order-page .crumbs { font-size: 0.9rem; }
  .order-page .crumbs a { color: var(--ink-muted); }
  .order-status {
    display: inline-block;
    margin-inline-start: var(--space-1);
    padding-block: 0.1em;
    padding-inline: var(--space-2);
    border-radius: var(--radius);
    font-size: 0.85rem;
    font-weight: 600;
    background: var(--surface-sunken);
  }
  .order-status:is([data-status='paid'], [data-status='delivered']) { color: var(--ok); }
  .order-status:is([data-status='cancelled'], [data-status='refunded'], [data-status='partially_refunded']) {
    color: var(--danger);
  }
  .order-table { inline-size: 100%; border-collapse: collapse; }
  .order-table caption { text-align: start; color: var(--ink-muted); padding-block-end: var(--space-1); }
  .order-table :is(th, td) {
    padding-block: var(--space-2);
    padding-inline-end: var(--space-2);
    text-align: start;
    border-block-end: 1px solid var(--line);
    font-variant-numeric: tabular-nums;
  }
  .order-table td:last-child, .order-table thead th:last-child { text-align: end; padding-inline-end: 0; }
  .order-page .pager { display: flex; gap: var(--space-3); align-items: center; justify-content: space-between; }
  .order-page .notice {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius);
    border: 1px solid var(--line);
    background: var(--surface-raised);
  }
  .order-page .notice[data-kind='error'] { border-color: var(--danger); color: var(--danger); }
  .order-page .notice[data-kind='success'] { border-color: var(--ok); }
  .timeline { margin: 0; padding-inline-start: var(--space-4); display: grid; gap: var(--space-1); }
  .timeline time { color: var(--ink-muted); font-variant-numeric: tabular-nums; }
  .order-detail details { display: grid; gap: var(--space-2); }
  .order-detail summary { cursor: pointer; color: var(--danger); font-weight: 600; }
  :is(.order-detail, .order-lookup) button {
    font: inherit;
    padding-block: var(--space-2);
    padding-inline: var(--space-3);
    border: 0;
    border-radius: var(--radius);
    background: var(--brand);
    color: var(--brand-ink);
    cursor: pointer;
  }
  .order-detail [data-component='cancel-form'] button { background: var(--danger); }
  .order-lookup form { display: grid; gap: var(--space-2); max-inline-size: 28rem; }
  .order-lookup form p { margin: 0; display: grid; gap: var(--space-1); }
  .order-lookup input {
    font: inherit;
    padding: var(--space-2);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--surface-raised);
    color: var(--ink);
  }
  @container confirmation (inline-size < 30rem) {
    .order-table :is(thead th, td):nth-child(4) { display: none; }
  }
}
`;
