import { describe, expect, it } from 'vitest';
import { budgetFailures, CLS_BUDGET, LCP_BUDGET_MS, median, report } from '../lib/perf.mjs';

const ok = { lcpMs: 900, cls: 0.01, jsGzip: 1000, jsRaw: 3000, css: 500 };

describe('perf budgets', () => {
  it('takes the median of odd and even samples', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('passes a page within every budget', () => {
    expect(budgetFailures('home', ok, { jsGzip: 1000 })).toEqual([]);
  });

  it('fails LCP, CLS and JS above budget (JS = baseline + 10%)', () => {
    const slow = { ...ok, lcpMs: LCP_BUDGET_MS + 1, cls: CLS_BUDGET + 0.01, jsGzip: 1101 };
    const failures = budgetFailures('home', slow, { jsGzip: 1000 });
    expect(failures).toHaveLength(3);
    expect(budgetFailures('home', { ...ok, jsGzip: 1100 }, { jsGzip: 1000 })).toEqual([]);
  });

  it('skips the JS check when no baseline is recorded', () => {
    expect(budgetFailures('home', { ...ok, jsGzip: 10 ** 9 }, undefined)).toEqual([]);
  });

  it('reports a Markdown table', () => {
    expect(report([{ name: 'home (/)', ...ok }])).toContain('| home (/) | 900 ms | 0.010 |');
  });
});
