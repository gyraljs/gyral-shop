/* global document, window -- page.evaluate callbacks run in the browser */
// `pnpm smoke:prod`: the production build (production Lit, minified, code-split) must hydrate
// in place. Seeds a throwaway database, builds, starts the production server and, in Chromium,
// checks key pages: exactly one <h1>, every data-region rendered as often as the server sent it,
// no element left in defer-hydration, no page or console errors, and each component's view the
// same size as the server's. Then exercises add to cart and a listing filter in production.
// Catches production-only hydration bugs that development-Lit tests cannot (Gyral gyral-czi.41).
//   pnpm smoke:prod             build + check
//   pnpm smoke:prod --no-build  reuse dist/
import { chromium } from 'playwright';
import { discoverPaths, startProduction } from './lib/prod-server.mjs';
import {
  compareSummaries,
  ignoredConsole,
  markServerNodes,
  replacedNodes,
  summarize,
} from './lib/smoke.mjs';

const args = new Set(process.argv.slice(2));
const started = Date.now();
const problems = [];
const rows = [];

/** Loads `path` in `page`, compares it with the HTML the server sends for the same visitor. */
async function checkPage(page, base, path, allow) {
  const errors = [];
  const onConsole = (m) => {
    if (m.type() === 'error' && !ignoredConsole(m.text())) errors.push(`console: ${m.text()}`);
  };
  const onError = (e) => errors.push(`page error: ${String(e).split('\n')[0]}`);
  page.on('console', onConsole);
  page.on('pageerror', onError);
  const html = await (await page.request.get(base + path)).text();
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const fn = summarize.toString();
  const server = await page.evaluate(`(${fn})(Document.parseHTMLUnsafe(${JSON.stringify(html)}))`);
  const live = await page.evaluate(`(${fn})(document)`);
  // Hydration must keep the server's nodes: a fresh client render looks identical but replaces
  // them (markServerNodes tagged them before any module script ran).
  const replaced = await page.evaluate(
    `(${replacedNodes.toString()})(document, ${JSON.stringify(allow ?? {})})`,
  );
  if (replaced.length > 0) {
    const sample = [...new Set(replaced)].slice(0, 5).join(', ');
    errors.push(
      `${String(replaced.length)} server node(s) replaced instead of hydrated: ${sample}`,
    );
  }
  // Lazy islands (hydrate: 'visible') wait below the fold by design; scrolled into view they
  // must hydrate.
  if (live.islands > 0) {
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await page.waitForTimeout(1_000);
    const after = await page.evaluate(`(${fn})(document)`);
    if (after.islands > 0) {
      errors.push(`${String(after.islands)} island(s) never hydrated after scrolling into view`);
    }
  }
  page.off('console', onConsole);
  page.off('pageerror', onError);
  const found = compareSummaries(path, server, live, errors, allow);
  rows.push({
    path,
    h1: live.h1,
    regions: Object.keys(live.regions).length,
    islands: live.islands,
    problems: found.length,
  });
  problems.push(...found);
}

/** Add to cart from a product page: the badge updates without a navigation. */
async function addToCart(page, base, product) {
  await page.goto(base + product, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    window.__smokeMarker = 'same-document';
  });
  const before = await page.locator('shop-mini-cart [part="badge"]').first().textContent();
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  try {
    await page.waitForFunction(
      (prev) => {
        const host = document.querySelector('shop-mini-cart');
        const badge = host?.shadowRoot?.querySelector('[part="badge"]');
        return badge !== null && badge !== undefined && badge.textContent?.trim() !== prev?.trim();
      },
      before,
      { timeout: 10_000 },
    );
  } catch {
    problems.push(
      `${product}: add to cart did not update the cart badge (was "${String(before)}")`,
    );
  }
  const marker = await page.evaluate(() => window.__smokeMarker);
  if (marker !== 'same-document') problems.push(`${product}: add to cart navigated away`);
}

/** Ticking a listing filter updates the URL and results in place (no navigation). */
async function filterInPlace(page, base, category) {
  await page.goto(base + category, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    window.__smokeMarker = 'same-document';
  });
  const box = page.locator('[data-region="filters"] input[type="checkbox"]').first();
  await box.check();
  try {
    await page.waitForURL((url) => url.search !== '', { timeout: 10_000 });
  } catch {
    problems.push(`${category}: ticking a filter did not update the URL`);
  }
  await page.waitForLoadState('networkidle');
  const marker = await page.evaluate(() => window.__smokeMarker);
  if (marker !== 'same-document') problems.push(`${category}: filtering reloaded the page`);
}

const { base, stop } = await startProduction({ build: !args.has('--no-build'), quiet: true });
const browser = await chromium.launch();
try {
  const { department, product } = await discoverPaths(base);
  const category = '/c/electronics/tvs';
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(markServerNodes);
  const page = await context.newPage();
  for (const path of [
    '/',
    department,
    category,
    product,
    '/search?q=kitchen',
    '/cart',
    '/account/login',
  ]) {
    await checkPage(page, base, path);
  }
  // Prerendered pages carry nothing per visitor: the consent banner opens after hydration for
  // undecided visitors, and the mini-cart swaps its plain link for the cart once it has loaded.
  await checkPage(page, base, '/about', {
    regions: ['consent'],
    hosts: ['shop-consent', 'shop-mini-cart'],
  });
  await addToCart(page, base, product);
  await checkPage(page, base, '/cart'); // now with a line
  await checkPage(page, base, '/checkout');
  await filterInPlace(page, base, category);
  await context.close();
} catch (error) {
  problems.push(`smoke:prod: ${String(error)}`);
} finally {
  await browser.close();
  stop();
}

console.log(
  rows
    .map(
      (r) =>
        `${r.path.padEnd(40)} h1=${String(r.h1)} regions=${String(r.regions)} ` +
        `islands=${String(r.islands)} problems=${String(r.problems)}`,
    )
    .join('\n'),
);
console.log(`(${String(Math.round((Date.now() - started) / 1000))} s)`);
if (problems.length > 0) {
  console.error(`\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('smoke:prod: the production build hydrates in place; add to cart and filters work');
