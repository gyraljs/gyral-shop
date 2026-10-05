import { describe, expect, it } from 'vitest';
import { createTestDb } from '../db/client.js';
import { createServices } from './container.js';
import { usd } from '../domain/money.js';

const CARD = { number: '4242 4242 4242 4242', expiry: '12/30', cvc: '123' };

describe('createServices', () => {
  it('builds one mailer and payment provider on the shared clock', async () => {
    const db = await createTestDb();
    const fixed = new Date('2026-10-04T12:00:00Z');
    const services = createServices({ db, now: () => fixed });
    expect(services.now()).toBe(fixed);
    const intent = await services.payments.createIntent({ amount: usd(500), card: CARD });
    expect(intent.ok).toBe(true);
    await services.mailer.send({ to: 'a@b.test', subject: 'Hi', text: 'Hi', html: '<p>Hi</p>' });
    expect(await services.mailer.list()).toHaveLength(1);
  });

  it('uses replacements and a given secret, or a random per-process secret', async () => {
    const db = await createTestDb();
    const base = createServices({ db });
    const replaced = createServices({ db, payments: base.payments, secret: 's'.repeat(32) });
    expect(replaced.payments).toBe(base.payments);
    expect(replaced.secret).toBe('s'.repeat(32));
    expect(createServices({ db }).secret).not.toBe(base.secret);
    expect(base.secret).toMatch(/^[0-9a-f]{64}$/);
  });
});
