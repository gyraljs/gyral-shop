// `pnpm ci:local`: runs .github/workflows/ci.yml in Docker with `gh act` (ADR 0004) and exits
// by the jobs' results, not act's exit code (scripts/lib/act.mjs, ported from Gyral). The
// GitHub token from `gh auth token` is passed as a secret so act can fetch the workflow's
// actions (act masks it in its output). Extra arguments go to act.
import { execFileSync, spawn } from 'node:child_process';
import { jobResults } from './lib/act.mjs';

const token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
const args = [
  'act',
  'workflow_dispatch',
  '-W',
  '.github/workflows/ci.yml',
  '-s',
  `GITHUB_TOKEN=${token}`,
  ...process.argv.slice(2),
];
const child = spawn('gh', args, { stdio: ['inherit', 'pipe', 'pipe'] });

let log = '';
const tee = (target) => (chunk) => {
  log += String(chunk);
  target.write(chunk);
};
child.stdout.on('data', tee(process.stdout));
child.stderr.on('data', tee(process.stderr));

child.on('close', (code) => {
  const result = jobResults(log);
  const note =
    result.ok && code !== 0 ? ` (act exited ${String(code)} after the jobs finished; ignored)` : '';
  console.log(`\nci:local: ${result.ok ? 'PASS' : 'FAIL'}: ${result.reason}${note}`);
  process.exit(result.ok ? 0 : 1);
});
