// `pnpm themes:check [page…]`: runs `pnpm ui:check` once per registered theme (every page
// scenario × light/dark × desktop/phone, with axe incl. colour contrast, overflow and console
// checks) and writes a themes × pages matrix to .ui-check/themes/<run>/matrix.md.
// Exits 1 if any theme fails any page. Too slow for `pnpm check` (several minutes); run it
// before merging theme or shared-style changes (ADR 0006, AGENTS.md).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { matrixReport, runFailed, themeNames } from './lib/themes-check.mjs';

const pagesArgs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const themes = themeNames(readdirSync('src/ui/themes'));
const startedAt = new Date().toISOString();
const outDir = join('.ui-check', 'themes', startedAt.replace(/[:.]/g, '-'));
mkdirSync(outDir, { recursive: true });

const runs = [];
for (const theme of themes) {
  console.log(`\n=== theme ${theme}`);
  const args = ['scripts/ui-check.mjs', ...pagesArgs];
  if (theme !== 'default') args.push(`--theme=${theme}`);
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  process.stdout.write(result.stdout);
  if (result.status === 2 || result.error !== undefined) {
    console.error(result.stderr || String(result.error));
    process.exit(2);
  }
  const report = /Report: (.+report\.md)/.exec(result.stdout)?.[1];
  if (report === undefined) {
    console.error(`ui:check for ${theme} wrote no report:\n${result.stderr}`);
    process.exit(2);
  }
  const results = JSON.parse(readFileSync(join(dirname(report), 'results.json'), 'utf8'));
  runs.push({ ...results, theme, report: relative(outDir, report) });
}

const matrix = join(outDir, 'matrix.md');
writeFileSync(matrix, matrixReport({ startedAt, runs }));
const failed = runs.filter(runFailed).map((r) => r.theme);
console.log(`\nMatrix: ${matrix}`);
console.log(failed.length === 0 ? 'All themes passed.' : `Failed themes: ${failed.join(', ')}`);
process.exit(failed.length === 0 ? 0 : 1);
