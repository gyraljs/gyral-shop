// Pure parts of `pnpm perf` (scripts/perf.mjs): statistics, budget checks and the report.
// Tested in scripts/test/perf.test.mjs. Budgets: docs/product-specs/quality.md.

export const LCP_BUDGET_MS = 2500;
export const CLS_BUDGET = 0.1;
/** JS budget per page = recorded baseline + 10% (quality.md). */
export const JS_HEADROOM = 1.1;

export const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Budget failures for one page's measurement against its recorded baseline. */
export function budgetFailures(name, measured, baseline) {
  const failures = [];
  if (measured.lcpMs > LCP_BUDGET_MS)
    failures.push(
      `${name}: LCP ${String(Math.round(measured.lcpMs))} ms > ${String(LCP_BUDGET_MS)} ms`,
    );
  if (measured.cls > CLS_BUDGET)
    failures.push(`${name}: CLS ${measured.cls.toFixed(3)} > ${String(CLS_BUDGET)}`);
  if (baseline !== undefined) {
    const limit = Math.round(baseline.jsGzip * JS_HEADROOM);
    if (measured.jsGzip > limit)
      failures.push(
        `${name}: JS ${String(measured.jsGzip)} B gzip > budget ${String(limit)} B (baseline + 10%)`,
      );
  }
  return failures;
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

/** A Markdown table of the measurements. */
export function report(rows) {
  const lines = [
    '| Page | LCP (median) | CLS | JS gzip | JS raw | CSS (inline + files) |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.name} | ${String(Math.round(r.lcpMs))} ms | ${r.cls.toFixed(3)} | ${kb(r.jsGzip)} | ${kb(r.jsRaw)} | ${kb(r.css)} |`,
    );
  }
  return lines.join('\n');
}
