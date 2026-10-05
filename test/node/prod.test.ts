// Production pipeline smoke test (shop-2gz, Gyral ADR 0016): a real Vite client build, the
// prerender step, then the production server answering requests. Static pages carry no
// per-visitor data; the header and mini-cart personalize after hydration (/api/me, the cart).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FetchApp } from '@gyral/ssr/static';
import { createTestDb, type Db } from '../../src/db/client.js';
import { insertSeed } from '../../src/db/seed/insert.js';
import { prerenderSite } from '../../src/server/prerender.js';
import { createProdApp } from '../../src/server/prod-app.js';
import { SESSION_COOKIE } from '../../src/server/security/index.js';
import { createSession } from '../../src/services/sessions.js';
import { CSRF_FIELD } from '../../src/ui/forms/csrf.js';
import { smallCatalog } from '../support/app.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = mkdtempSync(join(tmpdir(), 'gyral-shop-prod-'));
const config = {
  PAYMENT_LATENCY_MS: 0,
  APP_SECRET: 'a-production-secret-of-32-characters!',
  SITE_ORIGIN: 'https://shop.example',
};
let db: Db;
let app: FetchApp;
let prerendered: readonly string[] = [];

const req = (path: string, init?: RequestInit): Promise<Response> =>
  Promise.resolve(app.fetch(new Request(new URL(path, 'http://localhost'), init)));

beforeAll(async () => {
  db = await createTestDb();
  const data = smallCatalog();
  await insertSeed(db, data, new Map(data.users.map((u) => [u.email, 'scrypt$test$test'])));
  await build({
    root,
    configFile: join(root, 'vite.config.ts'),
    logLevel: 'silent',
    build: { outDir: join(dist, 'client') },
  });
  prerendered = await prerenderSite(dist, db, config);
  app = await createProdApp({ distDir: dist, db, config });
}, 120_000);

afterAll(() => {
  rmSync(dist, { recursive: true, force: true });
});

describe('production build', () => {
  it('prerenders the static content pages, with no per-visitor data', () => {
    expect(prerendered).toEqual(['/about', '/faq', '/terms', '/privacy']);
    const html = readFileSync(join(dist, 'static', 'about', 'index.html'), 'utf8');
    expect(html).toMatch(/src="\/assets\/entry-[\w-]+\.js"/);
    expect(html).toContain('<link rel="canonical" href="https://shop.example/about"');
    expect(html).toMatch(/<shop-header[^>]*\spersonalize/);
    expect(html).not.toContain('name="csrf-token"');
    expect(html).not.toContain('data-gyral-stores'); // the cart is loaded after hydration
  });

  it('serves prerendered pages from disk with revalidation and security headers', async () => {
    const res = await req('/about');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    expect(res.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await res.text()).toBe(
      readFileSync(join(dist, 'static', 'about', 'index.html'), 'utf8'),
    );
  });

  it('renders everything else per request, never cached', async () => {
    const res = await req('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(await res.text()).toMatch(/src="\/assets\/entry-[\w-]+\.js"/);
  });

  it('serves hashed assets as immutable JavaScript', async () => {
    const html = await (await req('/')).text();
    const src = /src="(\/assets\/entry-[\w-]+\.js)"/.exec(html)?.[1] ?? '';
    const res = await req(src);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/javascript');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('accepts a form POST with the session CSRF token, and refuses one without', async () => {
    const session = await createSession(db, { now: new Date() });
    const cookie = `${SESSION_COOKIE}=${session.id}`;
    const [product] = smallCatalog().products;
    const sku = product?.variants[0]?.sku ?? '';
    const post = (fields: Record<string, string>) =>
      req('/cart/add', { method: 'POST', headers: { cookie }, body: new URLSearchParams(fields) });
    const ok = await post({ sku, quantity: '1', [CSRF_FIELD]: session.csrfToken });
    expect([ok.status, ok.headers.get('location')]).toEqual([303, '/cart']);
    expect((await post({ sku, quantity: '1' })).status).toBe(403);
  });

  it('tells a prerendered page who is signed in, without caching or new sessions', async () => {
    const guest = await req('/api/me');
    expect(await guest.json()).toEqual({ account: null, consentDecided: false });
    expect(guest.headers.get('cache-control')).toBe('no-store');
    expect(guest.headers.getSetCookie()).toEqual([]);
  });

  it('keeps 404s and refuses paths outside the build', async () => {
    expect((await req('/nope')).status).toBe(404);
    expect((await req('/assets/..%2F..%2Fpackage.json')).status).toBe(404);
  });
});
