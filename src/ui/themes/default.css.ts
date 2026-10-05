// The default look as a theme (ADR 0006 rule 7): today's palette, type and component colours.
// Sibling themes (Marketplace, Supercenter, Boutique) define the same tokens and may also
// re-lay out regions through the stable hooks. Writes only to @layer theme.
import type { ThemeDefinition } from './theme.js';

export const defaultThemeCss = `
@layer theme {
  :root {
    --font-sans: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    --font-display: var(--font-sans);
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
    --brand-size: 1.4rem;
    --header-bg: var(--brand);
    --header-ink: var(--brand-ink);
    --nav-bg: oklch(from var(--brand) calc(l - 0.08) c h);
  }
}
`;

export const defaultTheme: ThemeDefinition = {
  name: 'default',
  label: 'Gyral Goods',
  description: 'The house look: warm red header, rounded cards, system type.',
  css: defaultThemeCss,
};
