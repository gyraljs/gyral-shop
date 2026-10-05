// The Marketplace theme honours the theme contract (docs/design-docs/0006-theming.md): it writes
// only to @layer theme, defines every token the default theme defines, and targets only
// documented hooks — landmarks and elements, data-region / data-component values listed in the
// ADR, and documented ::part names. No classes or ids: those are not part of the contract.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultThemeCss } from '../../src/ui/themes/default.css.js';
import { marketplaceThemeCss } from '../../src/ui/themes/marketplace.css.js';
import { findTheme } from '../../src/ui/themes/registry.js';

const adr = readFileSync(
  new URL('../../docs/design-docs/0006-theming.md', import.meta.url),
  'utf8',
);
const css = marketplaceThemeCss.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every selector (split on top-level commas) in style rules, skipping at-rule preludes. */
function selectors(source: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(/([^{};]+)\{/g)) {
    const prelude = (match[1] ?? '').trim();
    if (prelude === '' || prelude.startsWith('@') || prelude.startsWith(':root')) continue;
    let depth = 0;
    let current = '';
    for (const ch of prelude) {
      if (ch === '(' || ch === '[') depth += 1;
      if (ch === ')' || ch === ']') depth -= 1;
      if (ch === ',' && depth === 0) {
        out.push(current.trim());
        current = '';
      } else current += ch;
    }
    out.push(current.trim());
  }
  return out;
}

const tokens = (source: string) =>
  new Set([...source.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

const ALLOWED_ATTRIBUTES = new Set(['data-region', 'data-component', 'aria-current', 'type']);

describe('Marketplace theme', () => {
  it('is registered and writes only to @layer theme', () => {
    expect(findTheme('marketplace')?.css).toBe(marketplaceThemeCss);
    expect(css.trim().startsWith('@layer theme {')).toBe(true);
    expect(css.match(/@layer/g)).toHaveLength(1);
  });

  it('defines every token the default theme defines', () => {
    const missing = [...tokens(defaultThemeCss)].filter((t) => !tokens(css).has(t));
    expect(missing).toEqual([]);
  });

  it('targets only documented hooks, elements and parts', () => {
    const list = selectors(css);
    expect(list.length).toBeGreaterThan(20);
    const problems: string[] = [];
    for (const selector of list) {
      const bare = selector.replace(/\[[^\]]*\]/g, '[]');
      if (/(^|[\s>+~(,])\.[a-zA-Z_-]/.test(bare) || /\w\.[a-zA-Z_-]/.test(bare))
        problems.push(`class in ${selector}`);
      if (bare.includes('#')) problems.push(`id in ${selector}`);
      for (const [, name, value] of selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
        if (!ALLOWED_ATTRIBUTES.has(name ?? ''))
          problems.push(`attribute ${name ?? ''} in ${selector}`);
        if (
          (name === 'data-region' || name === 'data-component') &&
          !adr.includes(`"${value ?? ''}"`)
        )
          problems.push(`undocumented hook ${name ?? ''}="${value ?? ''}"`);
      }
      for (const [, part] of selector.matchAll(/::part\(([\w-]+)\)/g))
        if (!adr.includes(`\`${part ?? ''}\``)) problems.push(`undocumented part ${part ?? ''}`);
    }
    expect(problems).toEqual([]);
  });
});
