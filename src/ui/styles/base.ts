// Global document styles: the layer order, reset, system tokens and the page shell. Component
// styles are document sheets in src/ui/styles/ (light DOM) or a widget's own styles (shadow
// DOM, through tokens and ::parts). The look is a theme (src/ui/themes/, ADR 0006).
export const baseCss = `
@layer reset, tokens, base, components, theme;

@layer reset {
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; }
  img, svg { display: block; max-inline-size: 100%; }
}

@layer tokens {
  /* System tokens and neutral fallbacks (ADR 0006 rule 4). The look itself — palette, fonts,
     radii, component colours — comes from the active theme in @layer theme
     (src/ui/themes/*.css.ts). Without a theme the page falls back to the browser's system
     colours: plain but fully usable, the Zen Garden baseline. */
  :root {
    color-scheme: light dark;
    --font-sans: system-ui, sans-serif;
    --font-display: var(--font-sans);
    --brand: LinkText;
    --brand-ink: Canvas;
    --surface: Canvas;
    --surface-raised: Field;
    --surface-sunken: Canvas;
    --ink: CanvasText;
    /* GrayText fails contrast on ButtonFace (3.4:1); muted text falls back to full ink. */
    --ink-muted: CanvasText;
    --line: GrayText;
    --line-strong: CanvasText;
    --danger: CanvasText;
    --focus: Highlight;
    --rating-fill: Highlight;
    --shadow-popover: none;
    --sale: CanvasText;
    --ok: CanvasText;
    --radius: 0.25rem;
    /* Spacing and layout scale (themes may change density by overriding these). */
    --space-1: 0.25rem;
    --space-2: 0.5rem;
    --space-3: 1rem;
    --space-4: 1.5rem;
    --space-5: 2.5rem;
    --page-max: 80rem;
    /* Type scale. */
    --step--1: 0.875rem;
    --step-0: 1rem;
    --step-1: 1.25rem;
    --step-2: 1.5rem;
    --step-3: 2rem;
    --brand-size: 1.4rem;
    /* Component tokens, derived from the palette unless a theme sets them. */
    --header-bg: var(--brand);
    --header-ink: var(--brand-ink);
    --nav-bg: oklch(from var(--header-bg) calc(l - 0.08) c h);
    --nav-ink: var(--header-ink);
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
    /* header, consent banner (only for undecided visitors; empty otherwise), main, footer */
    grid-template-rows: auto auto 1fr auto;
    /* One column no wider than the viewport: an auto column would grow to the widest
       unwrapped content (the department nav) and overflow phones. */
    grid-template-columns: minmax(0, 1fr);
  }
  body > shop-header { grid-row: 1; }
  body > shop-consent { grid-row: 2; }
  body > main { grid-row: 3; }
  body > .site-footer { grid-row: 4; }
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
