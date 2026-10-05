// Origin checks behind a reverse proxy (shop-gsi, ADR 0002): the request URL is internal, so
// the browser's Origin must be matched against SITE_ORIGIN (or, with trustProxy, the
// forwarded origin) as well as the request's own origin.
import { describe, expect, it } from 'vitest';
import { CSRF_HEADER } from '../../src/ui/forms/csrf.js';
import { testApp, type TestApp } from '../support/app.js';
import { guest } from '../support/auth.js';

const PUBLIC = 'https://shop.example';

async function echoApp(options: Parameters<typeof testApp>[0]): Promise<TestApp> {
  const t = await testApp(options);
  t.app.post('/__t/echo', (c) => c.text('ok'));
  return t;
}

async function post(t: TestApp, headers: Record<string, string>): Promise<number> {
  const g = await guest(t);
  const res = await g.get('/__t/echo', {
    method: 'POST',
    headers: { [CSRF_HEADER]: g.session.csrfToken, ...headers },
  });
  return res.status;
}

describe('CSRF origin check behind a proxy', () => {
  it('accepts the public SITE_ORIGIN although the request URL is internal', async () => {
    const t = await echoApp({ siteOrigin: PUBLIC });
    expect(await post(t, { origin: PUBLIC })).toBe(200);
  });

  it('still accepts the request origin and refuses other sites', async () => {
    const t = await echoApp({ siteOrigin: PUBLIC });
    expect(await post(t, { origin: 'http://localhost' })).toBe(200);
    expect(await post(t, { origin: 'https://evil.test' })).toBe(403);
  });

  it('rejects the public origin when SITE_ORIGIN is not configured (no guessing)', async () => {
    const t = await echoApp({});
    expect(await post(t, { origin: PUBLIC })).toBe(403);
  });

  it('accepts the forwarded origin only when trustProxy is set', async () => {
    const forwarded = {
      origin: PUBLIC,
      'x-forwarded-host': 'shop.example',
      'x-forwarded-proto': 'https',
    };
    expect(await post(await echoApp({ trustProxy: true }), forwarded)).toBe(200);
    expect(await post(await echoApp({}), forwarded)).toBe(403);
  });
});

describe('consent (origin-verified) behind a proxy', () => {
  it('accepts a consent POST from the public SITE_ORIGIN and refuses another site', async () => {
    const t = await testApp({ siteOrigin: PUBLIC });
    const send = (origin: string) =>
      t.app.request('http://localhost/consent', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ choice: 'reject', return: '/' }).toString(),
      });
    expect((await send(PUBLIC)).status).not.toBe(403);
    expect((await send('https://evil.test')).status).toBe(403);
  });
});
