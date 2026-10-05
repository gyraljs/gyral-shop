// Every registered theme keeps the Zen Garden contract (ADR 0006), checked table-driven so a
// new theme is covered the moment it's registered:
// - it is registered, and writes only inside one @layer theme block;
// - it sets every token the default theme sets (so no theme inherits another's look);
// - its selectors use only documented hooks (data-region / data-component values from the ADR),
//   documented ::part()s, documented component tags and semantic elements — no classes or ids;
// - pages render with that theme's stylesheet linked when the theme cookie selects it.
// The visual side (axe incl. contrast, overflow) is `pnpm themes:check`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEME_COOKIE, themeHref } from '../../src/server/theme.js';
import { defaultTheme } from '../../src/ui/themes/default.css.js';
import { findTheme, THEMES } from '../../src/ui/themes/registry.js';
import { testApp } from '../support/app.js';

const adr = readFileSync(
  new URL('../../docs/design-docs/0006-theming.md', import.meta.url),
  'utf8',
);
const between = (from: string, to: string) => adr.slice(adr.indexOf(from), adr.indexOf(to));
const hooksTable = between('## Hooks (keep current)', '## Parts (keep current)');
const partsTable = between('## Parts (keep current)', '## Consequences');
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
  'html body header nav main footer section article aside search ul ol li a img picture figure figcaption h1 h2 h3 h4 p ins del s strong em small span button input select textarea form label fieldset legend table thead tbody tr th td dl dt dd details summary output meter time hr'.split(
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

function selectorProblems(css: string): string[] {
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
  return problems;
}

const tokensSetBy = (source: string): Set<string> =>
  new Set([...source.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1] ?? ''));

describe.each(THEMES.map((theme) => [theme.name, theme] as const))(
  'theme %s (ADR 0006)',
  (name, theme) => {
    it('is registered and writes only inside one @layer theme block', () => {
      expect(findTheme(name)).toBe(theme);
      const body = theme.css.trim();
      expect(body.startsWith('@layer theme {')).toBe(true);
      let depth = 0;
      for (let i = 0; i < body.length; i += 1) {
        if (body[i] === '{') depth += 1;
        if (body[i] === '}') {
          depth -= 1;
          if (depth === 0) expect(i).toBe(body.length - 1);
        }
      }
      expect(depth).toBe(0);
    });

    it('sets every token the default theme sets', () => {
      const own = tokensSetBy(theme.css);
      expect([...tokensSetBy(defaultTheme.css)].filter((t) => !own.has(t))).toEqual([]);
    });

    it('targets only documented hooks, parts, component tags and semantic elements', () => {
      expect(selectorProblems(theme.css)).toEqual([]);
    });

    it('is linked by pages when the theme cookie selects it', async () => {
      const test = await testApp({ seed: false });
      for (const path of ['/', '/about', '/cart', '/account/login']) {
        const response = await test.get(path, { headers: { cookie: `${THEME_COOKIE}=${name}` } });
        const html = await response.text();
        expect(html, path).toMatch(new RegExp(`<link[^>]*id="theme-css"[^>]*>`));
        const link = /<link[^>]*id="theme-css"[^>]*>/.exec(html)?.[0] ?? '';
        // Prerendered pages link /themes/current.css, which the server answers from the cookie.
        expect(
          link.includes(themeHref(theme)) || link.includes('/themes/current.css'),
          `${path}: ${link}`,
        ).toBe(true);
      }
    });
  },
);

describe('theme contract checks (control)', () => {
  it('catch classes, unknown hooks, unknown parts and unknown component tags', () => {
    const problems = selectorProblems(
      '@layer theme { .bar { } #x { } [data-region="nope"] { } shop-x::part(zz) { } }',
    );
    expect(problems.join('\n')).toMatch(/class or id/);
    expect(problems.join('\n')).toMatch(/hook "nope"/);
    expect(problems.join('\n')).toMatch(/part "zz"/);
    expect(problems.join('\n')).toMatch(/element "shop-x"/);
  });
});
