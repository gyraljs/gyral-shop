// Theme contract checks (docs/design-docs/0006-theming.md, rule 4). Pure: tested in
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
 * Rule 3: every stylesheet sits in a cascade layer. Checks `css` template literals and
 * exported `...Css` strings: each must start (after comments) with `@layer` or with an
 * interpolation of another, already layered stylesheet.
 */
export function unlayeredStyles(file, text) {
  const blocks = /(?:\bcss`|export const \w+Css = `)([\s\S]*?)`/g;
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
