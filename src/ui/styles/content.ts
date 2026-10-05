// Content pages: about, FAQ, terms, privacy, contact (light DOM inside <main>). Tokens only.
export const contentCss = `
@layer components {
  .prose { max-inline-size: 42rem; display: grid; gap: var(--space-3); }
  .prose header { display: grid; gap: var(--space-1); }
  .prose h1, .prose h2 { margin: 0; text-wrap: balance; }
  .prose h2 { font-size: 1.2rem; margin-block-start: var(--space-2); }
  .prose p, .prose ul, .prose dl { margin: 0; text-wrap: pretty; }
  .prose .lead { color: var(--ink-muted); font-size: 1.1rem; }
  .prose section { display: grid; gap: var(--space-2); }
  .prose dt { font-weight: 600; }
  .prose dd { margin-inline-start: 0; margin-block-end: var(--space-2); }
  [data-component="faq"] { display: grid; gap: var(--space-2); }
  [data-component="faq"] details {
    border: 1px solid var(--line); border-radius: var(--radius);
    background: var(--surface-raised); padding: var(--space-2) var(--space-3);
  }
  [data-component="faq"] summary { cursor: pointer; font-weight: 600; }
  [data-component="faq"] details[open] summary { margin-block-end: var(--space-2); }
  [data-component="faq"] details::details-content {
    transition: content-visibility 0.2s allow-discrete, opacity 0.2s;
    opacity: 0;
  }
  [data-component="faq"] details[open]::details-content { opacity: 1; }
  @media (prefers-reduced-motion: reduce) {
    [data-component="faq"] details::details-content { transition: none; }
  }
  [data-region="error"] { display: grid; gap: var(--space-3); max-inline-size: 42rem; }
  [data-region="error"] h1 { margin: 0; }
  [data-region="error"] form { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
}
`;
