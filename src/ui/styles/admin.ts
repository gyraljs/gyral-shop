// The admin app (<shop-admin> and its sections): light DOM, document styles.
// Tokens only and layered: docs/design-docs/0006-theming.md.
export const adminCss = `
@layer components {
  .admin {
    container: admin / inline-size;
    display: grid;
    gap: var(--space-4);
    grid-template-columns: minmax(10rem, 13rem) minmax(0, 1fr);
    align-items: start;
  }
  @container admin (inline-size < 48rem) {
    .admin { grid-template-columns: minmax(0, 1fr); }
  }
  .admin-nav {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-raised);
  }
  .admin-nav .admin-brand { margin: 0; font-weight: 700; }
  .admin-nav ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-1); }
  .admin-nav a {
    display: block;
    padding-block: var(--space-1);
    padding-inline: var(--space-2);
    border-radius: var(--radius);
    text-decoration: none;
  }
  .admin-nav a:hover { background: var(--surface-sunken); }
  .admin-nav a[aria-current='page'] { background: var(--brand); color: var(--brand-ink); }
  .admin-main { min-inline-size: 0; }
  .admin-page { display: grid; gap: var(--space-4); }
  .admin-page :is(h1, h2) { margin: 0; }
  .admin-page h1:focus { outline: none; }
  .admin-page h1:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .admin-page > section {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-raised);
    min-inline-size: 0;
  }
  .admin-page [data-component='notice'] {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-raised);
  }
  .admin-page [data-component='notice'][data-kind='error'] { border-color: var(--danger); color: var(--danger); }
  .admin-page [data-component='notice'][data-kind='success'] { border-color: var(--ok); }
  .admin-page [data-component='empty'], .admin-page [data-component='loading'] {
    margin: 0;
    color: var(--ink-muted);
  }
  shop-admin-dashboard:state(loading) [data-component='loading'] { font-style: italic; }
  .admin-stats {
    display: grid;
    gap: var(--space-3);
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    margin: 0;
  }
  .admin-stats [data-component='stat'] {
    display: grid;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius);
    background: var(--surface-sunken);
  }
  .admin-stats dt { color: var(--ink-muted); font-size: 0.9rem; }
  .admin-stats dd { margin: 0; display: grid; font-variant-numeric: tabular-nums; }
  .admin-stats dd data { font-size: 1.4rem; font-weight: 700; }
  .admin-stats dd small { color: var(--ink-muted); }
  .admin-status-list, .admin-top-list { margin: 0; padding: 0; display: grid; gap: var(--space-1); }
  .admin-status-list { list-style: none; }
  .admin-top-list { padding-inline-start: var(--space-4); }
  .admin-status-list li, .admin-top-list li {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .admin-top-list span, .admin-status-list data { color: var(--ink-muted); font-variant-numeric: tabular-nums; }
  .admin-table-wrap { overflow-x: auto; }
  .admin-table-wrap:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .admin-variant { display: grid; gap: var(--space-2); padding-block: var(--space-2); border-block-start: 1px solid var(--line); }
  .admin-variant h3 { margin: 0; display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: baseline; }
  .admin-variant [data-component='stock'] { color: var(--ink-muted); font-weight: 400; }
  .admin-variant [data-stock='out'] { color: var(--danger); }
  .admin-page .crumbs { margin: 0; font-size: 0.9rem; }
  .admin-table { inline-size: 100%; border-collapse: collapse; }
  .admin-table caption { text-align: start; color: var(--ink-muted); padding-block-end: var(--space-1); }
  .admin-table :is(th, td) {
    padding-block: var(--space-2);
    padding-inline-end: var(--space-2);
    text-align: start;
    vertical-align: top;
    border-block-end: 1px solid var(--line);
    font-variant-numeric: tabular-nums;
  }
  .admin-table .num { text-align: end; }
  .admin-table td small { display: block; color: var(--ink-muted); }
  .admin-table td[data-stock='out'] { color: var(--danger); font-weight: 700; }
  .admin-table td[data-stock='low'] { color: var(--sale); }
  .admin-page .admin-table th button {
    font: inherit;
    font-weight: 700;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: var(--line-strong);
  }
  .admin-table th[aria-sort] button::after { content: ' ↕'; color: var(--ink-muted); }
  .admin-table th[aria-sort='ascending'] button::after { content: ' ↑'; color: inherit; }
  .admin-table th[aria-sort='descending'] button::after { content: ' ↓'; color: inherit; }
  .admin-toolbar { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: end; }
  .admin-toolbar label, .admin-form label { display: grid; gap: var(--space-1); font-weight: 600; }
  .admin-form { display: grid; gap: var(--space-3); max-inline-size: 48rem; }
  .admin-form fieldset {
    display: grid;
    gap: var(--space-3);
    margin: 0;
    padding: var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .admin-form .admin-row { display: grid; gap: var(--space-3); grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); }
  :is(.admin-form, .admin-toolbar) :is(input:not([type='checkbox']), select, textarea) {
    inline-size: 100%;
    padding: var(--space-2);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink);
  }
  .admin-form :is(input, select, textarea):user-invalid,
  .admin-form [aria-invalid='true'] { border-color: var(--danger); }
  .admin-form .field-error { margin: 0; color: var(--danger); font-weight: 400; }
  .admin-form .hint { margin: 0; color: var(--ink-muted); font-weight: 400; font-size: 0.9rem; }
  .admin-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
  .admin-page :is(button, .button) {
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--brand);
    border-radius: var(--radius);
    background: var(--brand);
    color: var(--brand-ink);
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
  }
  .admin-page :is(button, .button)[data-variant='quiet'] { background: var(--surface); color: var(--ink); border-color: var(--line-strong); }
  .admin-page :is(button, .button)[data-variant='danger'] { background: var(--surface); color: var(--danger); border-color: var(--danger); }
  .admin-page button:disabled { opacity: 0.6; cursor: progress; }
  /* Table sort buttons and pager buttons look like links, beating the button rule above. */
  .admin-page .admin-table th button, .admin-page .pager button { padding: 0; border: 0; background: none; color: inherit; }
  .admin-page .pager { display: flex; gap: var(--space-3); align-items: center; justify-content: space-between; }
  .admin-page .pager a[aria-disabled='true'] { color: var(--ink-muted); pointer-events: none; }
}
@layer base {
  /* The admin needs JavaScript; without it only the <noscript> explanation shows. */
  @media (scripting: none) {
    shop-admin { display: none; }
  }
}
`;
