// pnpm ui:check [page…] [--baseline | --compare]
// Seeds a fresh file database, starts the shop dev server on it, drives each page template
// through ui-scenarios/<name>.mjs in headless Chromium at desktop and phone widths in light
// and dark, and records screenshots, console problems, horizontal overflow and axe violations
// into .ui-check/<run>/report.md. Exits 1 if anything fails. Ported from Gyral's tool; see
// docs/design-docs/0005-testing.md.
import { execFileSync, spawn } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import pixelmatch from 'pixelmatch';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import {
  PRIMARY,
  SCHEMES,
  VIEWPORTS,
  axeSummary,
  overflowFinding,
  parseArgs,
  renderReport,
  resolveScenario,
  shotFailures,
  significantConsole,
  validateScenario,
} from './lib/ui-check.mjs';

/* global document, axe -- measureOverflow and runAxe's callback run in the page */

const pageFailed = (p) => Boolean(p.error) || p.shots.some((s) => shotFailures(s).length > 0);

const require = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const OUT = '.ui-check';
const BASELINE = join(OUT, 'baseline');
const SCENARIOS = 'ui-scenarios';
const DB_FILE = join(OUT, 'db', 'shop.db');
const DATABASE_URL = `file:${DB_FILE}`;

const { options, errors, usage } = parseArgs(process.argv.slice(2), process.env);
if (errors.length > 0) {
  if (!errors.includes('help')) console.error(errors.join('\n'));
  console.error(usage);
  process.exit(errors.includes('help') ? 0 : 2);
}

const allNames = readdirSync(SCENARIOS)
  .filter((f) => f.endsWith('.mjs'))
  .map((f) => f.slice(0, -4))
  .sort();
const names =
  options.pages.length === 0 ? allNames : allNames.filter((n) => options.pages.includes(n));
if (names.length === 0) {
  console.error(`No scenarios match: ${options.pages.join(', ')} (have: ${allNames.join(', ')})`);
  process.exit(2);
}

async function loadScenarios() {
  const problems = [];
  const pages = [];
  for (const name of names) {
    const scenario = (await import(pathToFileURL(resolve(SCENARIOS, `${name}.mjs`)).href)).default;
    problems.push(...validateScenario(name, scenario));
    pages.push({ name, scenario, shots: [] });
  }
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(2);
  }
  return pages;
}

/** A fresh, deterministic database for every run, so screenshots are comparable. */
function seed() {
  rmSync(join(OUT, 'db'), { recursive: true, force: true });
  mkdirSync(join(OUT, 'db'), { recursive: true });
  execFileSync('pnpm', ['exec', 'tsx', 'scripts/seed.ts'], {
    env: { ...process.env, DATABASE_URL },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

/** Placeholders scenarios use, picked from the seeded catalog. */
async function placeholders() {
  const db = createClient({ url: DATABASE_URL });
  const one = async (sql) => {
    const { rows } = await db.execute(sql);
    const value = rows[0]?.[0];
    if (value === undefined || value === null) throw new Error(`no seed row for: ${sql}`);
    return String(value);
  };
  const product = (variants) =>
    one(`select p.slug from products p join variants v on v.product_id = p.id
         where p.archived = 0 group by p.id
         having count(v.id) ${variants} and sum(v.stock) > 0 order by p.id limit 1`);
  const values = {
    product: await product('= 1'),
    variantProduct: await product('> 1'),
    category: await one(`select '/c/' || d.slug || '/' || c.slug from categories c
         join departments d on d.id = c.department_id
         join products p on p.category_id = c.id and p.archived = 0
         group by c.id order by count(p.id) desc, c.id limit 1`),
    customer: await one(`select email from users where role = 'customer' order by id limit 1`),
    password: 'gyral-customer-2026',
  };
  db.close();
  return values;
}

const portFree = (port) =>
  new Promise((ok) => {
    const server = createServer()
      .once('error', () => ok(false))
      .once('listening', () => server.close(() => ok(true)))
      .listen(port, '127.0.0.1');
  });

async function waitForServer(url, timeoutMs = 90_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server did not start: ${url}`);
}

function startServer() {
  const child = spawn('pnpm', ['exec', 'tsx', 'src/server/dev.ts'], {
    env: {
      ...process.env,
      DATABASE_URL,
      PORT: String(options.port),
      HMR_PORT: String(options.port + 1),
      NODE_ENV: 'development',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true, // own process group, so stopping kills tsx and node under it
  });
  let log = '';
  child.stderr.on('data', (chunk) => (log += String(chunk)));
  return {
    stop: () => {
      try {
        process.kill(-(child.pid ?? 0), 'SIGTERM');
      } catch {
        // already gone
      }
    },
    log: () => log,
  };
}

function locate(page, target) {
  const exact = target.exact === true ? { exact: true } : {};
  if ('role' in target)
    return page.getByRole(
      target.role,
      target.name === undefined ? {} : { name: target.name, ...exact },
    );
  if ('label' in target) return page.getByLabel(target.label, exact);
  if ('text' in target) return page.getByText(target.text, exact);
  return page.locator(target.css);
}

async function runStep(page, base, step) {
  if ('goto' in step) await page.goto(base + step.goto, { waitUntil: 'networkidle' });
  else if ('click' in step) await locate(page, step.click).first().click();
  else if ('fill' in step) await locate(page, step.fill).first().fill(step.value);
  else if ('check' in step) await locate(page, step.check).first().check();
  else if ('select' in step) await locate(page, step.select).first().selectOption(step.value);
  else if ('press' in step) await page.keyboard.press(step.press);
  else if ('waitFor' in step) await locate(page, step.waitFor).first().waitFor({ timeout: 15_000 });
  else if ('wait' in step) await page.waitForTimeout(step.wait);
}

/** Measured in the page: document overflow plus the elements sticking out, shadow roots included. */
function measureOverflow() {
  const doc = document.documentElement;
  const width = doc.clientWidth;
  const offenders = [];
  const describe = (el) =>
    el.localName +
    (el.id ? `#${el.id}` : '') +
    (el.classList.length ? `.${[...el.classList].join('.')}` : '');
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > width + 1)
        offenders.push({ selector: describe(el), right: Math.round(r.right) });
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  offenders.sort((a, b) => b.right - a.right);
  return { scrollWidth: doc.scrollWidth, clientWidth: width, offenders: offenders.slice(0, 5) };
}

async function runAxe(page) {
  // Evaluated through the DevTools protocol, not an inline <script>: the shop's CSP blocks
  // inline scripts, and bypassing CSP would hide real CSP violations from the run.
  await page.evaluate(AXE_SOURCE);
  const violations = await page.evaluate(async () => {
    const result = await axe.run(document, { resultTypes: ['violations'] });
    return result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.length,
      targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
    }));
  });
  return axeSummary(violations);
}

function compareShot(file, baselineFile, diffFile) {
  if (!existsSync(baselineFile))
    return { failed: true, reason: 'no baseline (run with --baseline first)' };
  const a = PNG.sync.read(readFileSync(baselineFile));
  const b = PNG.sync.read(readFileSync(file));
  if (a.width !== b.width || a.height !== b.height)
    return {
      failed: true,
      reason: `size changed ${String(a.width)}×${String(a.height)} → ${String(b.width)}×${String(b.height)}`,
    };
  const diff = new PNG({ width: a.width, height: a.height });
  const pixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold: options.threshold,
  });
  const ratio = pixels / (a.width * a.height);
  if (pixels > 0) writeFileSync(diffFile, PNG.sync.write(diff));
  return {
    failed: ratio > options.maxDiff,
    reason: `${String(pixels)} px differ (${(ratio * 100).toFixed(3)}%)`,
    ...(pixels > 0 ? { diffFile: diffFile.split('/').slice(-2).join('/') } : {}),
  };
}

async function checkPage(browser, p, base, runDir) {
  mkdirSync(join(runDir, p.name), { recursive: true });
  for (const viewport of VIEWPORTS) {
    for (const scheme of SCHEMES) {
      const name = `${viewport.name}-${scheme}.png`;
      const shot = {
        viewport: viewport.name,
        scheme,
        file: `${p.name}/${name}`,
        console: [],
        axe: [],
      };
      // A fresh context per shot: its own cookies, so member scenarios sign in each time.
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: scheme,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      const entries = [];
      page.on('console', (m) => entries.push({ type: m.type(), text: m.text() }));
      page.on('pageerror', (e) => entries.push({ type: 'pageerror', text: String(e) }));
      try {
        await page.goto(base + p.scenario.path, { waitUntil: 'networkidle' });
        const primary = viewport.name === PRIMARY.viewport && scheme === PRIMARY.scheme;
        if (primary || !p.scenario.once)
          for (const step of p.scenario.steps) {
            // A step may be limited to one viewport (e.g. opening a panel only phones collapse).
            if (step.viewport === undefined || step.viewport === viewport.name)
              await runStep(page, base, step);
          }
        await page.waitForTimeout(250);
        shot.overflow = overflowFinding(await page.evaluate(measureOverflow));
        shot.axe = await runAxe(page);
        // Sticky elements depend on the scroll position the steps left: reset it so full-page
        // screenshots compare deterministically.
        await page.evaluate(() => {
          globalThis.scrollTo(0, 0);
        });
        await page.waitForTimeout(100);
        await page.screenshot({ path: join(runDir, p.name, name), fullPage: true });
        if (options.compare)
          shot.diff = compareShot(
            join(runDir, p.name, name),
            join(BASELINE, p.name, name),
            join(runDir, p.name, `diff-${name}`),
          );
        if (options.baseline) {
          mkdirSync(join(BASELINE, p.name), { recursive: true });
          copyFileSync(join(runDir, p.name, name), join(BASELINE, p.name, name));
        }
      } catch (error) {
        shot.error = String(error).split('\n')[0];
      }
      shot.console = significantConsole(entries, p.scenario.allowConsole ?? []);
      p.shots.push(shot);
      await context.close();
    }
  }
}

const loaded = await loadScenarios();
for (const port of [options.port, options.port + 1]) {
  if (!(await portFree(port))) {
    console.error(`Port ${String(port)} is busy. Pick another with --port=… or UI_CHECK_PORT.`);
    process.exit(2);
  }
}

seed();
const values = await placeholders();
const pages = loaded.map((p) => ({ ...p, scenario: resolveScenario(p.scenario, values) }));

const startedAt = new Date().toISOString();
const runDir = join(OUT, startedAt.replace(/[:.]/g, '-'));
mkdirSync(runDir, { recursive: true });
const server = startServer();
process.on('SIGINT', () => (server.stop(), process.exit(130)));
const base = `http://localhost:${String(options.port)}`;

let browser;
try {
  await waitForServer(`${base}/`);
  browser = await chromium.launch();
  for (const p of pages) {
    process.stdout.write(`${p.name.padEnd(22)} `);
    try {
      await checkPage(browser, p, base, runDir);
    } catch (error) {
      p.error = String(error).split('\n')[0];
    }
    console.log(pageFailed(p) ? 'FAIL' : 'ok');
  }
} catch (error) {
  console.error(String(error), '\n', server.log().slice(-2000));
  server.stop();
  process.exit(1);
} finally {
  await browser?.close();
  server.stop();
}

const mode = options.baseline ? 'baseline saved' : options.compare ? 'compared with baseline' : '';
writeFileSync(join(runDir, 'report.md'), renderReport({ startedAt, mode, pages }));
const failed = pages.filter(pageFailed);
console.log(`\nReport: ${join(runDir, 'report.md')}`);
console.log(`${String(pages.length - failed.length)}/${String(pages.length)} pages passed.`);
process.exit(failed.length > 0 ? 1 : 0);
