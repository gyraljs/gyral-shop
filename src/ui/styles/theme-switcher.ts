// Document styles for <shop-theme-switcher> (light DOM; theme contract ADR 0006: tokens only,
// layered). Themes may restyle it through data-region="theme-switcher".
export const themeSwitcherCss = `
@layer components {
  shop-theme-switcher { display: block; margin-block: var(--space-3); }
  .theme-switcher { display: flex; flex-wrap: wrap; align-items: end; gap: var(--space-2); }
  .theme-switcher fieldset {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-3);
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .theme-switcher legend { padding-inline: var(--space-1); font-weight: 600; }
  .theme-switcher label { display: inline-flex; align-items: center; gap: var(--space-1); cursor: pointer; }
  .theme-switcher input { accent-color: var(--brand); }
  .theme-switcher button {
    font: inherit;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius);
    border: 1px solid var(--line-strong);
    background: var(--surface-raised);
    color: var(--ink);
    cursor: pointer;
  }
  .theme-status:empty { display: none; }
  .theme-status { margin: 0; color: var(--ink-muted); }
}
`;
