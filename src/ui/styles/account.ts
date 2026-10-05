// Styles for the sign-in, registration and account pages (light DOM inside <main>).
export const accountCss = `
@layer components {
  .auth, .account { max-inline-size: 32rem; display: grid; gap: var(--space-3); }
  .auth h1, .account h1 { margin-block: 0; }
  .auth > p { margin-block: 0; }
  .account-details {
    display: grid; grid-template-columns: max-content 1fr; gap: var(--space-1) var(--space-3);
    margin: 0;
  }
  .account-details dt { font-weight: 600; }
  .account-details dd { margin: 0; overflow-wrap: anywhere; }
  .account-layout {
    display: grid; gap: var(--space-4);
    grid-template-columns: minmax(0, 1fr);
  }
  @media (width > 48rem) {
    .account-layout { grid-template-columns: 14rem minmax(0, 1fr); }
  }
  [data-region="account-nav"] ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-1); }
  [data-region="account-nav"] a { display: block; padding: var(--space-1) var(--space-2); border-radius: var(--radius); }
  [data-region="account-nav"] a[aria-current="page"] { background: var(--surface-sunken); font-weight: 600; }
  .account h2 { margin-block: var(--space-3) 0; font-size: 1.15rem; }
  .account section { display: grid; gap: var(--space-2); }
  .notice {
    margin: 0; padding: var(--space-2) var(--space-3); border-radius: var(--radius);
    border-inline-start: 4px solid var(--ok);
    background: color-mix(in oklch, var(--ok) 10%, var(--surface-raised));
  }
  .notice[data-kind="error"] {
    border-inline-start-color: var(--danger);
    background: color-mix(in oklch, var(--danger) 10%, var(--surface-raised));
  }
  .address-list {
    list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-3);
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  }
  [data-component="address-card"] {
    display: grid; gap: var(--space-2); align-content: start;
    padding: var(--space-3); border: 1px solid var(--line); border-radius: var(--radius);
    background: var(--surface-raised);
  }
  [data-component="address-card"][data-default] { border-color: var(--brand); }
  [data-component="address-card"] address { font-style: normal; }
  [data-component="address-card"] form, .address-actions { margin: 0; }
  [data-component="badge"] {
    margin: 0; justify-self: start; font-size: 0.8rem; font-weight: 700;
    padding-inline: var(--space-2); border-radius: var(--radius);
    background: var(--brand); color: var(--brand-ink);
  }
  .button-link {
    font: inherit; padding: 0; border: 0; background: none; color: inherit;
    text-decoration: underline; cursor: pointer;
  }
}
`;
