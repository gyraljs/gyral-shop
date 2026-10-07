// Theme contract checks (docs/design-docs/0006-theming.md, rules 3 and 4 and the relative-colour addendum). Pure: tested in
// scripts/test/styles.test.mjs. Each finding says how to fix it.

const RULES = [
  {
    // #abc, #aabbcc, #aabbccdd used as a CSS value (after ':', ',', '(' or whitespace).
    re: /(?<=[:,(\s])#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b(?=[\s;,)])/g,
    why: 'hex colour',
  },
  { re: /\b(?:rgba?|hsla?)\(/g, why: 'rgb()/hsl() colour' },
  { re: /\b(?:oklch|oklab|lch|lab)\(\s*[\d.]/g, why: 'literal oklch()/lab() colour' },
  { re: /font-family:(?!\s*var\()/g, why: 'literal font-family' },
  { re: /var\(--[\w-]+\s*,\s*(?!var\()[^)\s]/g, why: 'literal fallback inside var()' },
];

/** Findings for one file's text. Lines with `theme-ok` in a comment are skipped. */
export function styleViolations(file, text) {
  const findings = [];
  text.split('\n').forEach((line, index) => {
    if (line.includes('theme-ok')) return;
    for (const { re, why } of RULES) {
      for (const match of line.matchAll(re)) {
        findings.push(
          `${file}:${String(index + 1)}: ${why} "${match[0].trim()}". Use a token from ` +
            `@layer tokens (src/ui/styles/base.ts) or a theme file; see ` +
            `docs/design-docs/0006-theming.md rule 4.`,
        );
      }
    }
  });
  return findings;
}

/** Token definitions and theme files are where literal values belong. */
export const isExempt = (file) =>
  file.endsWith('src/ui/styles/base.ts') || file.includes('src/ui/themes/');

/**
 * Rule 3: every stylesheet sits in a cascade layer. Checks `css` template literals, plain
 * `styles: `…`` strings and exported `...Css` strings: each must start (after comments) with `@layer` or with an
 * interpolation of another, already layered stylesheet.
 */
export function unlayeredStyles(file, text) {
  const blocks = /(?:\bcss`|export const \w+Css = `|\bstyles:\s*`)([\s\S]*?)`/g;
  const findings = [];
  for (const match of text.matchAll(blocks)) {
    const body = (match[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '').trimStart();
    if (body === '' || body.startsWith('@layer') || body.startsWith('${')) continue;
    const line = text.slice(0, match.index).split('\n').length;
    findings.push(
      `${file}:${String(line)}: stylesheet outside a cascade layer. Wrap it in ` +
        `@layer components { … } (docs/design-docs/0006-theming.md rule 3).`,
    );
  }
  return findings;
}

/**
 * Relative colour from a token (`oklch(from var(--x) …)`) breaks when a theme defines that
 * token with light-dark(). Outside theme files, use a dedicated token that each theme sets
 * per scheme (docs/design-docs/0006-theming.md, "Relative colour" addendum).
 */
export function relativeColourFromTokens(file, text) {
  if (file.includes('src/ui/themes/')) return [];
  const findings = [];
  text.split('\n').forEach((line, index) => {
    if (/\bfrom\s+var\(--/.test(line)) {
      findings.push(
        `${file}:${String(index + 1)}: relative colour from a token. Themes may define tokens ` +
          `with light-dark(), which relative colour can't resolve; add a dedicated token in ` +
          `@layer tokens and set it in every theme (ADR 0006).`,
      );
    }
  });
  return findings;
}
