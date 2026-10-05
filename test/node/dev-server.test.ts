// The dev server creates a fresh app per request (src/server/dev.ts). State that must hold
// across requests — the secret signing place-order keys and the guest orders cookie — has to
// come from options built once per process (src/server/dev-options.ts).
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { createTestDb } from '../../src/db/client.js';
import type { AppOptions } from '../../src/server/app.js';
import { createApp } from '../../src/server/app.js';
import { devAppOptions } from '../../src/server/dev-options.js';
import type { TestApp } from '../support/app.js';
import { guest } from '../support/auth.js';
import { insertCartFixture, T0 } from '../support/cart-fixture.js';
import { placeOrder } from '../support/orders.js';

/** A TestApp that, like `pnpm dev`, builds a new app for every request. */
async function perRequestApp(options: () => AppOptions): Promise<TestApp> {
  const db = await createTestDb();
  await insertCartFixture(db);
  const withDb = () => ({ ...options(), db });
  const get = (path: string, init?: RequestInit) =>
    Promise.resolve(createApp(withDb()).request(path, init));
  return {
    db,
    app: createApp(withDb()),
    get,
    html: async (path) => (await get(path)).text(),
    now: () => T0,
  };
}

describe('dev server (fresh app per request)', () => {
  const config = loadConfig({ NODE_ENV: 'development' }); // no APP_SECRET, like a fresh clone

  it('places an order: options, and so the secret, are built once per process', async () => {
    const db = await createTestDb();
    const once = devAppOptions(config, db);
    const test = await perRequestApp(() => once);
    await expect(placeOrder(await guest(test))).resolves.toMatch(/^GG-/);
  });

  it('fails the way the old dev server did when the secret changes per request', async () => {
    const db = await createTestDb();
    const test = await perRequestApp(() => devAppOptions(config, db));
    await expect(placeOrder(await guest(test))).rejects.toThrow(
      /place order failed: 303 \/checkout/,
    );
  });
});
