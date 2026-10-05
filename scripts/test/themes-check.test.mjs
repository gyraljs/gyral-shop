import { describe, expect, it } from 'vitest';
import { matrixReport, pageProblems, runFailed, themeNames } from '../lib/themes-check.mjs';

const ok = {
  name: 'home',
  error: null,
  shots: [{ viewport: 'desktop', scheme: 'light', failures: [] }],
};
const bad = {
  name: 'cart',
  error: null,
  shots: [{ viewport: 'phone', scheme: 'dark', failures: ['axe: color-contrast (2)'] }],
};

describe('themes:check', () => {
  it('finds theme files, default first', () => {
    expect(
      themeNames([
        'registry.ts',
        'theme.ts',
        'supercenter.css.ts',
        'default.css.ts',
        'boutique.css.ts',
      ]),
    ).toEqual(['default', 'boutique', 'supercenter']);
  });

  it('collects problems per page and fails a run with any problem', () => {
    expect(pageProblems(bad)).toEqual(['phone/dark: axe: color-contrast (2)']);
    expect(runFailed({ pages: [ok] })).toBe(false);
    expect(runFailed({ pages: [ok, bad] })).toBe(true);
    expect(runFailed({ pages: [{ ...ok, error: 'timeout' }] })).toBe(true);
  });

  it('renders a themes × pages matrix with failures listed', () => {
    const md = matrixReport({
      startedAt: 'now',
      runs: [
        { theme: 'default', report: '../a/report.md', pages: [ok, { ...bad, shots: [] }] },
        { theme: 'boutique', report: '../b/report.md', pages: [ok, bad] },
      ],
    });
    expect(md).toContain('| Page | [default](../a/report.md) | [boutique](../b/report.md) |');
    expect(md).toContain('| home | [pass](../a/home/) | [pass](../b/home/) |');
    expect(md).toContain('| cart | [pass](../a/cart/) | **FAIL** |');
    expect(md).toContain('- boutique › cart › phone/dark: axe: color-contrast (2)');
    expect(md).toContain('1 theme(s) with failures.');
  });
});
