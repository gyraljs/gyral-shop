import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, type Db } from '../db/client.js';
import { users } from '../db/schema/accounts.js';
import { authenticate } from './auth.js';
import { hashPassword } from './passwords.js';

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
  await db.insert(users).values([
    { email: 'ann@example.com', name: 'Ann', passwordHash: await hashPassword('correct horse 9') },
    {
      email: 'off@example.com',
      name: 'Off',
      passwordHash: await hashPassword('correct horse 9'),
      disabled: true,
    },
  ]);
});

describe('authenticate', () => {
  it('accepts the right password, ignoring email case and spaces', async () => {
    const result = await authenticate(db, '  ANN@example.com ', 'correct horse 9');
    expect(result.ok && result.value.email).toBe('ann@example.com');
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    expect(await authenticate(db, 'ann@example.com', 'nope')).toEqual({
      ok: false,
      error: { _tag: 'InvalidCredentials' },
    });
    expect(await authenticate(db, 'nobody@example.com', 'nope')).toEqual({
      ok: false,
      error: { _tag: 'InvalidCredentials' },
    });
  });

  it('reports a disabled account only after the password is right', async () => {
    expect(await authenticate(db, 'off@example.com', 'wrong')).toMatchObject({
      error: { _tag: 'InvalidCredentials' },
    });
    expect(await authenticate(db, 'off@example.com', 'correct horse 9')).toMatchObject({
      error: { _tag: 'Disabled' },
    });
    const [row] = await db.select().from(users).where(eq(users.email, 'off@example.com'));
    expect(row?.disabled).toBe(true);
  });
});
