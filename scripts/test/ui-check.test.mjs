import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  fillPlaceholders,
  overflowFinding,
  parseArgs,
  renderReport,
  resolveScenario,
  shotFailures,
  significantConsole,
  validateScenario,
} from '../lib/ui-check.mjs';

describe('parseArgs', () => {
  it('reads pages, modes and numeric options', () => {
    const { options, errors } = parseArgs(['cart', 'home', '--compare', '--port=5900'], {});
    expect(errors).toEqual([]);
    expect(options).toMatchObject({ pages: ['cart', 'home'], compare: true, port: 5900 });
  });

  it('defaults the port from UI_CHECK_PORT and rejects bad input', () => {
    expect(parseArgs([], { UI_CHECK_PORT: '6100' }).options.port).toBe(6100);
    expect(parseArgs(['--baseline', '--compare'], {}).errors).toHaveLength(1);
    expect(parseArgs(['--threshold=2'], {}).errors).toHaveLength(1);
    expect(parseArgs(['--nope'], {}).errors).toEqual(['unknown option --nope']);
  });
});

describe('scenarios', () => {
  it('every ui-scenarios/*.mjs is valid', async () => {
    const dir = resolve('ui-scenarios');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.mjs'))) {
      const scenario = (await import(pathToFileURL(resolve(dir, file)).href)).default;
      expect(validateScenario(file.slice(0, -4), scenario)).toEqual([]);
    }
  });

  it('requires a path and well-formed steps', () => {
    expect(validateScenario('x', { steps: [] })[0]).toContain('"path"');
    expect(validateScenario('x', { path: '/', steps: [{ click: 'Save' }] })[0]).toContain('target');
    expect(validateScenario('x', { path: '/', steps: [{ fill: { label: 'A' } }] })[0]).toContain(
      'value',
    );
  });

  it('accepts a per-step viewport limited to known viewports', () => {
    const step = { click: { text: 'Filters' } };
    expect(validateScenario('x', { path: '/', steps: [{ ...step, viewport: 'phone' }] })).toEqual(
      [],
    );
    expect(
      validateScenario('x', { path: '/', steps: [{ ...step, viewport: 'tablet' }] })[0],
    ).toContain('viewport');
  });

  it('resolves placeholders in paths, goto and fill values only', () => {
    const s = resolveScenario(
      {
        path: '/p/{product}',
        steps: [{ goto: '/c{category}' }, { fill: { label: '{customer}' }, value: '{customer}' }],
      },
      { product: 'tv', category: '/c/a/b', customer: 'ada@example.com' },
    );
    expect(s.path).toBe('/p/tv');
    expect(s.steps[0]).toEqual({ goto: '/c/c/a/b' });
    expect(s.steps[1]).toEqual({ fill: { label: '{customer}' }, value: 'ada@example.com' });
    expect(() => fillPlaceholders('{missing}', {})).toThrow('unknown placeholder {missing}');
  });
});

describe('findings', () => {
  it('filters expected console noise and allowed patterns', () => {
    const entries = [
      { type: 'warning', text: 'Lit is in dev mode. Not recommended for production!' },
      { type: 'error', text: 'Failed to load resource: the server responded with a status of 404' },
      { type: 'error', text: 'Boom' },
      { type: 'log', text: 'hello' },
    ];
    expect(significantConsole(entries, [/status of 404/]).map((e) => e.text)).toEqual(['Boom']);
  });

  it('reports overflow beyond a pixel of tolerance', () => {
    expect(overflowFinding({ scrollWidth: 391, clientWidth: 390, offenders: [] })).toBeUndefined();
    expect(
      overflowFinding({
        scrollWidth: 420,
        clientWidth: 390,
        offenders: [{ selector: 'div', right: 420 }],
      }),
    ).toEqual({ extra: 30, offenders: [{ selector: 'div', right: 420 }] });
  });

  it('renders a report with per-page results', () => {
    const ok = {
      viewport: 'desktop',
      scheme: 'light',
      file: 'home/desktop-light.png',
      console: [],
      axe: [],
    };
    const bad = {
      ...ok,
      scheme: 'dark',
      file: 'home/desktop-dark.png',
      axe: [
        { id: 'color-contrast', impact: 'serious', help: 'Contrast', nodes: 2, targets: ['a'] },
      ],
    };
    expect(shotFailures(bad)).toEqual(['1 axe']);
    const report = renderReport({
      startedAt: 'T',
      mode: '',
      pages: [{ name: 'home', shots: [ok, bad] }],
    });
    expect(report).toContain('1 pages, 0 passed, 1 failed.');
    expect(report).toContain('| [home](#home) | **FAIL** | desktop/dark: 1 axe |');
    expect(report).toContain('![home desktop dark](home/desktop-dark.png)');
  });
});
