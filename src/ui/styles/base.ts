// Global document styles (the page shell outside components). Component styles live in each
// component's `static styles`. Tokens are inherited custom properties, so components use
// them through the shadow boundary.
export const baseCss = `
@layer reset, tokens, base, components;

@layer reset {
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; }
  img, svg { display: block; max-inline-size: 100%; }
}

@layer tokens {
  :root {
    color-scheme: light dark;
    --font-sans: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    --brand: oklch(50% 0.2 25);
    --brand-ink: oklch(99% 0 0);
    --surface: light-dark(oklch(99% 0.003 250), oklch(18% 0.01 250));
    --surface-raised: light-dark(oklch(100% 0 0), oklch(23% 0.012 250));
    --surface-sunken: light-dark(oklch(96% 0.005 250), oklch(15% 0.01 250));
    --ink: light-dark(oklch(22% 0.02 250), oklch(93% 0.01 250));
    --ink-muted: light-dark(oklch(45% 0.02 250), oklch(72% 0.015 250));
    --line: light-dark(oklch(88% 0.01 250), oklch(32% 0.015 250));
    --line-strong: light-dark(oklch(60% 0.015 250), oklch(55% 0.015 250));
    --danger: light-dark(oklch(48% 0.19 25), oklch(74% 0.15 25));
    --focus: oklch(60% 0.18 250);
    --rating-fill: light-dark(oklch(75% 0.16 80), oklch(80% 0.15 80));
    --shadow-popover: 0 0.5rem 1.5rem light-dark(oklch(0% 0 0 / 0.15), oklch(0% 0 0 / 0.5));
    --sale: light-dark(oklch(50% 0.2 25), oklch(72% 0.17 25));
    --ok: light-dark(oklch(48% 0.13 150), oklch(75% 0.14 150));
    --radius: 0.5rem;
    --space-1: 0.25rem;
    --space-2: 0.5rem;
    --space-3: 1rem;
    --space-4: 1.5rem;
    --space-5: 2.5rem;
    --page-max: 80rem;
  }
}

@layer base {
  body {
    font-family: var(--font-sans);
    line-height: 1.5;
    background: var(--surface);
    color: var(--ink);
    min-block-size: 100dvb;
    display: grid;
    grid-template-rows: auto 1fr auto;
    /* One column no wider than the viewport: an auto column would grow to the widest
       unwrapped content (the department nav) and overflow phones. */
    grid-template-columns: minmax(0, 1fr);
  }
  a { color: inherit; }
  /* Form controls take the page font (shadow roots get this from shadow-base.ts). */
  button, input, select, textarea { font: inherit; }
  .skip-link {
    position: absolute;
    inset-inline-start: var(--space-2);
    inset-block-start: -10rem;
    padding: var(--space-2) var(--space-3);
    background: var(--surface-raised);
    color: var(--ink);
    border-radius: var(--radius);
    z-index: 10;
  }
  .skip-link:focus { inset-block-start: var(--space-2); }
  main:focus { outline: none; }
  :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .page { inline-size: min(100% - 2 * var(--space-3), var(--page-max)); margin-inline: auto; padding-block: var(--space-4); }
  h1, h2 { line-height: 1.2; text-wrap: balance; }
  p { text-wrap: pretty; }
  .site-footer {
    border-block-start: 1px solid var(--line);
    background: var(--surface-sunken);
    color: var(--ink-muted);
    font-size: 0.9rem;
  }
  .site-footer nav ul { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-3); }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }
}
`;
