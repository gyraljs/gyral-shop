// The Boutique theme keeps the Zen Garden contract (ADR 0006): it lives in @layer theme, sets
// every palette token the default theme sets, and targets only documented hooks, semantic
// elements and documented widget ::parts — never classes or ids.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { boutiqueTheme } from '../../src/ui/themes/boutique.css.js';
import { defaultTheme } from '../../src/ui/themes/default.css.js';
import { findTheme, THEMES } from '../../src/ui/themes/registry.js';

const adr = readFileSync(
  new URL('../../docs/design-docs/0006-theming.md', import.meta.url),
  'utf8',
);
const css = boutiqueTheme.css;

/** Selector preludes: the text before each `{`, minus at-rules and declarations. */
function selectors(source: string): string[] {
  const out: string[] = [];
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '');
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === ';' || ch === '}') start = i + 1;
    else if (ch === '{') {
      const prelude = text.slice(start, i).trim();
      if (prelude !== '' && !prelude.startsWith('@') && !prelude.startsWith(':root'))
        out.push(prelude);
      start = i + 1;
    }
  }
  return out;
}

const tokensSetBy = (source: string): Set<string> =>
  new Set([...source.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1] ?? ''));

describe('Boutique theme (ADR 0006)', () => {
  it('is registered and found by name', () => {
    expect(THEMES).toContain(boutiqueTheme);
    expect(findTheme('boutique')).toBe(boutiqueTheme);
  });

  it('writes only inside one @layer theme block', () => {
    const body = css.trim();
    expect(body.startsWith('@layer theme {')).toBe(true);
    let depth = 0;
    for (let i = 0; i < body.length; i += 1) {
      if (body[i] === '{') depth += 1;
      if (body[i] === '}') {
        depth -= 1;
        // The layer block closes only at the very end.
        if (depth === 0) expect(i).toBe(body.length - 1);
      }
    }
    expect(depth).toBe(0);
  });

  it('sets every palette and component token the default theme sets', () => {
    const missing = [...tokensSetBy(defaultTheme.css)].filter((t) => !tokensSetBy(css).has(t));
    expect(missing).toEqual([]);
  });

  it('never targets classes or ids', () => {
    const offending = selectors(css).filter((s) => /(^|[\s>+~(,])[.#][a-z_-]/i.test(s));
    expect(offending).toEqual([]);
  });

  it('uses only hooks documented in ADR 0006', () => {
    const hooks = [...css.matchAll(/data-(region|component)="([\w-]+)"/g)].map((m) => m[2] ?? '');
    expect(hooks.length).toBeGreaterThan(10);
    const undocumented = [...new Set(hooks)].filter((name) => !adr.includes(`"${name}"`));
    expect(undocumented).toEqual([]);
  });

  it('uses only ::parts documented in ADR 0006', () => {
    const parts = [...css.matchAll(/(shop-[\w-]+)::part\(([\w-]+)\)/g)];
    expect(parts.length).toBeGreaterThan(0);
    for (const [, widget = '', part = ''] of parts) {
      const row = adr.split('\n').find((line) => line.startsWith(`| \`${widget}\``)) ?? '';
      expect(row, `${widget}::part(${part})`).toContain(`\`${part}\``);
    }
  });
});
