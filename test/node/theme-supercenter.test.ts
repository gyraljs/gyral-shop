// The Supercenter theme keeps the Zen Garden contract (ADR 0006): it writes only to
// @layer theme and its selectors use only documented hooks — data-region / data-component
// values from the ADR's Hooks table, documented ::part()s and component tags — plus semantic
// elements. No classes or ids: those are component internals a theme must not depend on.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findTheme, THEMES } from '../../src/ui/themes/registry.js';
import { supercenterTheme } from '../../src/ui/themes/supercenter.css.js';

const adr = readFileSync(
  new URL('../../docs/design-docs/0006-theming.md', import.meta.url),
  'utf8',
);
const between = (from: string, to: string) => adr.slice(adr.indexOf(from), adr.indexOf(to));
const hooksTable = between('## Hooks (keep current)', '## Parts (keep current)');
const partsTable = between('## Parts (keep current)', '## Consequences');

/** Every quoted hook value in the Hooks table, plus the region names listed in rule 2. */
const documentedHooks = new Set(
  [
    ...(hooksTable + between('2. **Stable hooks.**', '3. **Layers.**')).matchAll(
      /"([a-z][a-z0-9-]*)"/g,
    ),
  ].map((m) => m[1]),
);
const documentedParts = new Set([...partsTable.matchAll(/`([a-z][a-z-]*)`/g)].map((m) => m[1]));
const documentedTags = new Set([...adr.matchAll(/<?(shop-[a-z-]+)/g)].map((m) => m[1]));
const SEMANTIC = new Set(
  'body header nav main footer section article aside search ul ol li a img h1 h2 h3 p ins del button input form label table'.split(
    ' ',
  ),
);

/** Selector lists of every style rule (at-rule preludes skipped), comments removed. */
function selectors(css: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: string[] = [];
  let prelude = '';
  for (const ch of text) {
    if (ch === '{') {
      const p = prelude.trim();
      if (p !== '' && !p.startsWith('@') && p !== ':root') out.push(p);
      prelude = '';
    } else if (ch === '}' || ch === ';') prelude = '';
    else prelude += ch;
  }
  return out;
}

describe('Supercenter theme', () => {
  const css = supercenterTheme.css;

  it('is registered and writes only to @layer theme', () => {
    expect(findTheme('supercenter')).toBe(supercenterTheme);
    expect(THEMES.map((t) => t.name)).toContain('supercenter');
    expect(css.trimStart().startsWith('@layer theme {')).toBe(true);
    expect(css.trim().endsWith('}')).toBe(true);
    expect(css.match(/@layer /g)).toHaveLength(1);
  });

  it('sets the core palette tokens for light and dark', () => {
    for (const token of [
      '--brand',
      '--surface',
      '--surface-raised',
      '--ink',
      '--ink-muted',
      '--line',
    ]) {
      expect(css, token).toMatch(new RegExp(`${token}: light-dark\\(`));
    }
  });

  it('targets only documented hooks, parts, component tags and semantic elements', () => {
    const problems: string[] = [];
    for (const selector of selectors(css)) {
      for (const [, value] of selector.matchAll(/\[data-(?:region|component)="([^"]+)"\]/g))
        if (value === undefined || !documentedHooks.has(value))
          problems.push(`${selector}: hook "${value ?? ''}"`);
      for (const [, part] of selector.matchAll(/::part\(([^)]+)\)/g))
        if (part === undefined || !documentedParts.has(part))
          problems.push(`${selector}: part "${part ?? ''}"`);
      const bare = selector
        .replace(/\[[^\]]*\]/g, '')
        .replace(/::?[a-z-]+(\([^)]*\))?/g, '')
        .replace(/\([^)]*\)/g, '');
      if (/(^|[\s>+~,(])[.#][a-z]/i.test(bare)) problems.push(`${selector}: class or id`);
      for (const [, tag] of bare.matchAll(/(?:^|[\s>+~,(])([a-z][a-z0-9-]*)/g)) {
        if (tag === undefined) continue;
        const ok = tag.includes('-') ? documentedTags.has(tag) : SEMANTIC.has(tag);
        if (!ok) problems.push(`${selector}: element "${tag}"`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('the selector check catches internals (control)', () => {
    const bad = selectors(
      '@layer theme { .bar { } [data-region="nope"] { } shop-x::part(zz) { } }',
    );
    expect(bad).toEqual(['.bar', '[data-region="nope"]', 'shop-x::part(zz)']);
    expect(documentedHooks.has('nope')).toBe(false);
    expect(documentedParts.has('zz')).toBe(false);
    expect(documentedTags.has('shop-x')).toBe(false);
  });
});
