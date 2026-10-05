// Runs after the tests in `pnpm check`: golden fixtures written by node tests must be stable.
// If a test run changed a fixture, either the change is intended (review it, then `git add`
// the fixture) or the fixture contains per-run data (pin it, e.g. test/support/fixtures.ts).
import { execFileSync } from 'node:child_process';

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
