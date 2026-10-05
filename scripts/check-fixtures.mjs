// Runs after the tests in `pnpm check`: golden fixtures written by node tests must be stable.
// If a test run changed a fixture, either the change is intended (review it, then `git add`
// the fixture) or the fixture contains per-run data (pin it, e.g. test/support/fixtures.ts).
import { execFileSync, spawnSync } from 'node:child_process';

// Without a git work tree there is nothing to compare against. That happens when `gh act`
// copies a git *worktree* into its container (its .git is a file pointing at a host path);
// a normal clone, the main checkout and real CI runners always have one.
const inRepo = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
if (inRepo.status !== 0 || inRepo.stdout.trim() !== 'true') {
  console.warn('fixtures: SKIPPED (not a git work tree, so changed fixtures cannot be detected)');
  process.exit(0);
}

const changed = execFileSync('git', ['diff', '--name-only', '--', 'test/fixtures'], {
  encoding: 'utf8',
}).trim();

if (changed !== '') {
  console.error(
    `Tests changed these fixtures:\n${changed}\n` +
      'If the markup change is intended, review the diff and `git add` the fixtures. If the ' +
      'fixture holds per-run data (tokens, ids, dates), pin it with test/support/fixtures.ts.',
  );
  process.exit(1);
}
console.log('fixtures: unchanged by the test run');
