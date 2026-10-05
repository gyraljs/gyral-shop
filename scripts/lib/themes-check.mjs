// Pure parts of `pnpm themes:check` (scripts/themes-check.mjs): theme discovery and the
// themes × pages matrix. Tested in scripts/test/themes-check.test.mjs.

/** Theme names from the files in src/ui/themes (`<name>.css.ts`), default first. */
export function themeNames(files) {
  const names = files
    .filter((f) => f.endsWith('.css.ts'))
    .map((f) => f.slice(0, -'.css.ts'.length))
    .sort();
  return [...names.filter((n) => n === 'default'), ...names.filter((n) => n !== 'default')];
}

/** Every problem on a page in one run, prefixed with viewport/scheme. */
export function pageProblems(page) {
  return [
    ...(page.error ? [`error: ${page.error}`] : []),
    ...page.shots.flatMap((s) => s.failures.map((f) => `${s.viewport}/${s.scheme}: ${f}`)),
  ];
}

export const runFailed = (run) => run.pages.some((p) => pageProblems(p).length > 0);

const cell = (text) => text.replaceAll('|', '\\|').replaceAll('\n', ' ');

/**
 * The matrix report. `runs` is one results.json per theme, plus `report` (a path to that
 * run's report.md, relative to the matrix file) for links.
 */
export function matrixReport({ startedAt, runs }) {
  const pageNames = [...new Set(runs.flatMap((r) => r.pages.map((p) => p.name)))];
  const failedRuns = runs.filter(runFailed);
  const lines = [
    `# Theme quality matrix — ${startedAt}`,
    '',
    `${String(runs.length)} themes × ${String(pageNames.length)} pages × light/dark × desktop/phone ` +
      `(axe incl. colour contrast, overflow, console). ` +
      (failedRuns.length === 0
        ? 'All passed.'
        : `${String(failedRuns.length)} theme(s) with failures.`),
    '',
    `| Page | ${runs.map((r) => `[${r.theme}](${r.report})`).join(' | ')} |`,
    `| --- | ${runs.map(() => '---').join(' | ')} |`,
  ];
  for (const name of pageNames) {
    const cells = runs.map((r) => {
      const page = r.pages.find((p) => p.name === name);
      if (page === undefined) return '—';
      return pageProblems(page).length === 0
        ? `[pass](${r.report.replace(/report\.md$/, '')}${name}/)`
        : `**FAIL**`;
    });
    lines.push(`| ${name} | ${cells.join(' | ')} |`);
  }
  const failures = runs.flatMap((r) =>
    r.pages.flatMap((p) =>
      pageProblems(p).map((problem) => `- ${r.theme} › ${p.name} › ${cell(problem)}`),
    ),
  );
  if (failures.length > 0) lines.push('', '## Failures', '', ...failures);
  return `${lines.join('\n')}\n`;
}
