// Rate limiting keys on the client address (ADR 0002), which reaches the app through Gyral's
// Node adapter: toNodeListener passes { incoming, remoteAddress } as the fetch env and
// security/request.ts reads `remoteAddress`. In-process requests have no socket: 'unknown'.
import { afterEach, describe, expect, it } from 'vitest';
import { ip } from '../../src/server/security/index.js';
import { CSRF_FIELD } from '../../src/ui/forms/csrf.js';
import { testApp, type TestApp, type TestAppOptions } from '../support/app.js';
import { guest } from '../support/auth.js';
import { listen, type Served } from '../support/server.js';

const LOOPBACK = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

let served: Served | undefined;
afterEach(async () => {
  await served?.close();
  served = undefined;
});

/** The app with a route that answers the rate-limit key's address, served over HTTP. */
async function probed(options: TestAppOptions = {}): Promise<{ test: TestApp; url: string }> {
  const test = await testApp(options);
  test.app.get('/__t/ip', (c) => c.text(ip(c)));
  served = await listen(test);
  return { test, url: served.url('/__t/ip') };
}

describe('client address for rate limiting', () => {
  it('is the socket peer over HTTP, and unknown in-process', async () => {
    const { test, url } = await probed();
    expect(LOOPBACK).toContain(await (await fetch(url)).text());
    expect(await (await test.get('/__t/ip')).text()).toBe('unknown');
  });

  it('ignores X-Forwarded-For unless trustProxy is set', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' };
    const plain = await probed();
    expect(LOOPBACK).toContain(await (await fetch(plain.url, { headers })).text());
    await served?.close();
    const proxied = await probed({ trustProxy: true });
    expect(await (await fetch(proxied.url, { headers })).text()).toBe('203.0.113.7');
  });

  it('limits registrations per address: another client keeps its own budget', async () => {
    const { test } = await probed();
    const g = await guest(test);
    const register = (send: (path: string, init: RequestInit) => Promise<Response>) =>
      send('/account/register', {
        method: 'POST',
        headers: { cookie: g.cookie },
        body: new URLSearchParams({
          name: 'X',
          email: 'not-an-email',
          password: '',
          confirm: '',
          [CSRF_FIELD]: g.session.csrfToken,
        }),
      });
    const overHttp = (path: string, init: RequestInit) => fetch(served?.url(path) ?? '', init);
    const statuses: number[] = [];
    for (let n = 0; n < 6; n += 1) statuses.push((await register(overHttp)).status);
    expect(statuses).toEqual([422, 422, 422, 422, 422, 429]);
    // Had the address not arrived, every client would share the 'unknown' key, now spent.
    expect((await register(test.get)).status).toBe(422);
  });
});
