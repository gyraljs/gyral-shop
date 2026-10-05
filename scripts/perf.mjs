/* global document -- the page.evaluate callback runs in the browser */
// `pnpm perf`: performance budgets on the production build (docs/product-specs/quality.md).
// Builds the app, seeds a throwaway database, starts the production server on a free port,
// then loads home, a category and a product page in Chromium with CPU (4x) and network
// (1.6 Mbps, 150 ms RTT) throttling, cold cache, three runs each. Reports median LCP, CLS and
// JS/CSS bytes, and fails above budget: LCP < 2.5 s, CLS < 0.1, JS gzip <= baseline + 10%.
//   pnpm perf                 build + measure + check
//   pnpm perf --no-build      reuse dist/
//   pnpm perf --update        record the current JS sizes as the new baseline
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { budgetFailures, median, report } from './lib/perf.mjs';

const RUNS = 3;
const BASELINE_FILE = 'scripts/perf-baseline.json';
const args = new Set(process.argv.slice(2));

const freePort = () =>
  new Promise((resolve) => {
    const server = createServer();
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

function run(cmd, cmdArgs, env) {
  const result = spawnSync(cmd, cmdArgs, { stdio: 'inherit', env: { ...process.env, ...env } });
  if (result.status !== 0) throw new Error(`${cmd} ${cmdArgs.join(' ')} failed`);
}

async function waitFor(url, timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server did not start: ${url}`);
}

/** One cold, throttled page load: LCP, CLS and the JS/CSS it needed. */
async function measure(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  let jsRaw = 0;
  let jsGzip = 0;
  let cssFiles = 0;
  page.on('response', async (response) => {
    const type = response.request().resourceType();
    if (type !== 'script' && type !== 'stylesheet') return;
    const body = await response.body().catch(() => Buffer.alloc(0));
    if (type === 'script') {
      jsRaw += body.length;
      jsGzip += gzipSync(body).length;
    } else cssFiles += body.length;
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  // Observers with `buffered: true` report entries recorded before they were created.
  const vitals = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let lcp = 0;
        let cls = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries())
            lcp = Math.max(lcp, e.renderTime || e.loadTime || e.startTime);
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
        const inline = [...document.querySelectorAll('style')].reduce(
          (n, s) => n + s.textContent.length,
          0,
        );
        setTimeout(() => resolve({ lcp, cls, inline }), 100);
      }),
  );
  await context.close();
  return { lcpMs: vitals.lcp, cls: vitals.cls, jsRaw, jsGzip, css: vitals.inline + cssFiles };
}

const work = mkdtempSync(join(tmpdir(), 'shop-perf-'));
let server;
try {
  const env = {
    NODE_ENV: 'production',
    APP_SECRET: randomBytes(32).toString('hex'),
    DATABASE_URL: `file:${join(work, 'shop.db')}`,
  };
  const dev = { ...env, NODE_ENV: 'development' };
  run('pnpm', ['exec', 'tsx', 'src/db/migrate.ts'], dev);
  run('pnpm', ['exec', 'tsx', 'scripts/seed.ts'], dev);
  // Prerendering reads the catalog, so the build runs against the seeded database.
  if (!args.has('--no-build') || !existsSync('dist/client')) run('pnpm', ['build'], dev);
  const port = await freePort();
  const base = `http://localhost:${String(port)}`;
  server = spawn('pnpm', ['exec', 'tsx', 'src/server/prod.ts'], {
    env: { ...process.env, ...env, PORT: String(port), SITE_ORIGIN: base },
    stdio: 'ignore',
    detached: true, // its own process group, so the whole tree stops with it
  });
  await waitFor(`${base}/`);

  const home = await (await fetch(`${base}/`)).text();
  const department = /href="(\/d\/[^"]+)"/.exec(home)?.[1];
  const deptHtml = await (await fetch(`${base}${department ?? '/d/electronics'}`)).text();
  const category = /href="(\/c\/[^"?#]+)"/.exec(deptHtml)?.[1];
  const catHtml = await (await fetch(`${base}${category ?? ''}`)).text();
  const product = /href="(\/p\/[^"?#/]+)"/.exec(catHtml)?.[1];
  if (category === undefined || product === undefined) throw new Error('no category/product link');
  const pages = [
    ['home', '/'],
    ['category', category],
    ['product', product],
  ];

  const browser = await chromium.launch();
  const rows = [];
  for (const [name, path] of pages) {
    const samples = [];
    for (let i = 0; i < RUNS; i += 1) samples.push(await measure(browser, `${base}${path}`));
    rows.push({
      name: `${name} (${path})`,
      key: name,
      lcpMs: median(samples.map((s) => s.lcpMs)),
      cls: median(samples.map((s) => s.cls)),
      jsRaw: median(samples.map((s) => s.jsRaw)),
      jsGzip: median(samples.map((s) => s.jsGzip)),
      css: median(samples.map((s) => s.css)),
    });
  }
  await browser.close();
  console.log(`\n${report(rows)}\n`);

  if (args.has('--update')) {
    const baseline = Object.fromEntries(rows.map((r) => [r.key, { jsGzip: r.jsGzip }]));
    writeFileSync(BASELINE_FILE, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`baseline written to ${BASELINE_FILE}`);
  }
  const baseline = existsSync(BASELINE_FILE) ? JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) : {};
  const failures = rows.flatMap((r) => budgetFailures(r.name, r, baseline[r.key]));
  if (failures.length > 0) {
    console.error(`Over budget:\n- ${failures.join('\n- ')}`);
    process.exitCode = 1;
  } else console.log('perf: all pages within budget');
} finally {
  if (server?.pid !== undefined) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
  rmSync(work, { recursive: true, force: true });
}
