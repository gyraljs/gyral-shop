import { describe, expect, it } from 'vitest';
import { createTestDb } from '../db/client.js';
import { authenticate } from './auth.js';
import { registerMember } from './accounts.js';

describe('registerMember', () => {
  it('creates a customer who can then sign in, with the email normalized', async () => {
    const db = await createTestDb();
    const created = await registerMember(db, {
      name: ' Ada Lovelace ',
      email: ' Ada@Example.COM ',
      password: 'analytical-engine',
    });
    expect(created.ok && created.value).toMatchObject({
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      role: 'customer',
    });
    const login = await authenticate(db, 'ada@example.com', 'analytical-engine');
    expect(login.ok).toBe(true);
  });

  it('refuses an email that is already registered', async () => {
    const db = await createTestDb();
    const member = { name: 'Ada', email: 'ada@example.com', password: 'analytical-engine' };
    await registerMember(db, member);
    const again = await registerMember(db, { ...member, email: 'ADA@example.com' });
    expect(again).toEqual({ ok: false, error: { _tag: 'EmailTaken' } });
  });
});
