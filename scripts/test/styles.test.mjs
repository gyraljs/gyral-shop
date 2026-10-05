import { describe, expect, it } from 'vitest';
import { isExempt, styleViolations, unlayeredStyles } from '../lib/styles.mjs';

const check = (css) => styleViolations('x.ts', css);

describe('styleViolations', () => {
  it('flags literal colours, fonts and var() fallbacks', () => {
    expect(check('color: #b00020;')).toHaveLength(1);
    expect(check('border: 1px solid #ccc;')).toHaveLength(1);
    expect(check('background: rgb(0 0 0);')).toHaveLength(1);
    expect(check('box-shadow: 0 1px 2px oklch(0% 0 0 / 0.2);')).toHaveLength(1);
    expect(check('font-family: Georgia, serif;')).toHaveLength(1);
    expect(check('color: var(--sale, red);')).toHaveLength(1);
    expect(check('color: var(--sale, #b00020);')[0]).toContain('0006-theming.md');
  });

  it('allows tokens, relative colours, var fallbacks and id selectors', () => {
    expect(check('color: var(--ink);')).toEqual([]);
    expect(check('background: oklch(from var(--brand) l c h / 0.1);')).toEqual([]);
    expect(check('color: var(--a, var(--b));')).toEqual([]);
    expect(check('font-family: var(--font-sans);')).toEqual([]);
    expect(check('<a href="#main">Skip</a> #details { }')).toEqual([]);
    expect(check('color: #fff; /* theme-ok: favicon */')).toEqual([]);
  });

  it('exempts token definitions and theme files', () => {
    expect(isExempt('src/ui/styles/base.ts')).toBe(true);
    expect(isExempt('src/ui/themes/marketplace.css.ts')).toBe(true);
    expect(isExempt('src/ui/styles/buy-box.ts')).toBe(false);
  });
});

describe('unlayeredStyles', () => {
  it('flags css templates and exported Css strings outside a layer', () => {
    expect(unlayeredStyles('x.ts', 'styles: css`:host { display: block; }`')).toHaveLength(1);
    expect(
      unlayeredStyles('x.ts', 'export const fooCss = `\n.a { color: var(--ink); }`;'),
    ).toHaveLength(1);
  });

  it('accepts layered or composed stylesheets', () => {
    expect(
      unlayeredStyles('x.ts', 'styles: css`\n  /* note */\n  @layer components { :host {} }`'),
    ).toEqual([]);
    expect(unlayeredStyles('x.ts', 'export const barCss = `${baseCss}${fooCss}`;')).toEqual([]);
  });
});
