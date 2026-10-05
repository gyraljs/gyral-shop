// Document styles for <shop-consent> (light DOM; theme contract ADR 0006: tokens only, layered).
// The banner is a non-modal region in the page flow, between the header and the main content.
export const consentCss = `
@layer components {
  shop-consent { display: block; }
  /* In the page flow under the header: visible on arrival, never covering content. */
  .consent-banner {
    padding: var(--space-3);
    background: var(--surface-raised);
    color: var(--ink);
    border-block-end: 1px solid var(--line-strong);
  }
  .consent-banner > * { max-inline-size: var(--page-max); margin-inline: auto; }
  .consent h2 { margin-block: 0 var(--space-2); font-size: 1.1rem; }
  .consent p { margin-block: 0 var(--space-2); }
  .consent-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .consent button {
    font: inherit;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius);
    border: 1px solid var(--brand);
    background: var(--brand);
    color: var(--brand-ink);
    cursor: pointer;
  }
  .consent button[value='reject'],
  .consent button[value='save'] { background: var(--surface-raised); color: var(--ink); }
  .consent button:disabled { opacity: 0.6; cursor: progress; }
  .consent-custom { margin-block-start: var(--space-2); }
  .consent-custom summary { cursor: pointer; inline-size: fit-content; }
  .consent-custom fieldset {
    display: grid;
    gap: var(--space-2);
    margin-block: var(--space-2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .consent-custom small { color: var(--ink-muted); }
}
`;
