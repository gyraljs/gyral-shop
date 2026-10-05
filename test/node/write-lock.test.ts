// Concurrent writes on a real file database (separate libsql connections, as in the dev
// server) must neither fail with SQLITE_BUSY/TRANSACTION_ACTIVE nor deadlock: every write goes
// through the lock in src/db/tx.ts (enforced by an ESLint rule).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrateDb, openDb, type Db } from '../../src/db/client.js';
import { addToCart, mergeGuestCart, setCartQuantity } from '../../src/services/cart.js';
import { createMailer } from '../../src/services/mail.js';
import {
  createSession,
  destroySession,
  loadSession,
  rotateSession,
} from '../../src/services/sessions.js';
import { SKU, T0, insertCartFixture } from '../support/cart-fixture.js';

let dir: string;
let db: Db;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'shop-lock-'));
  db = await openDb(`file:${join(dir, 'shop.db')}`);
  await migrateDb(db);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('concurrent writes through the lock', () => {
  it('serves many shoppers adding, changing, merging and signing out at once', async () => {
    const { userId } = await insertCartFixture(db);
    const mailer = createMailer(db);
    const guests = await Promise.all(
      Array.from({ length: 12 }, () => createSession(db, { now: T0 })),
    );
    const results = await Promise.allSettled([
      ...guests.map((g) => addToCart(db, { kind: 'guest', sessionId: g.id }, SKU.lego, 1)),
      ...guests.map((g) => addToCart(db, { kind: 'guest', sessionId: g.id }, SKU.tv, 1)),
      ...guests.map((g) => loadSession(db, g.id, new Date(T0.getTime() + 10 * 60_000))),
      ...guests
        .slice(0, 4)
        .map((g) => mailer.send({ to: 'a@b.test', subject: g.id, text: 't', html: 'h' })),
      ...Array.from({ length: 6 }, (_, i) =>
        setCartQuantity(db, { kind: 'member', userId }, SKU.lego, i + 1),
      ),
    ]);
    expect(results.filter((r) => r.status === 'rejected')).toEqual([]);

    // Second wave: logins (rotate + merge) racing sign-outs and more cart writes.
    const second = await Promise.allSettled([
      ...guests.slice(0, 6).map(async (g) => {
        const next = await rotateSession(db, g.id, { userId, now: T0 });
        return mergeGuestCart(db, next.id, userId);
      }),
      ...guests.slice(6).map((g) => destroySession(db, g.id)),
      ...guests.slice(6).map(() => addToCart(db, { kind: 'member', userId }, SKU.lego, 1)),
    ]);
    expect(second.filter((r) => r.status === 'rejected')).toEqual([]);
    expect((await mailer.list()).length).toBe(4);
  });

  it('runs a locked write nested in another without deadlocking, and rejects db writes inside a transaction', async () => {
    const { lockedWrite, writeTransaction } = await import('../../src/db/tx.js');
    await db.run('CREATE TABLE n (v INTEGER)');
    await lockedWrite(db, async (w) => {
      await w.run('INSERT INTO n VALUES (1)');
      await lockedWrite(db, (inner) => inner.run('INSERT INTO n VALUES (2)'));
    });
    await writeTransaction(db, async (tx) => {
      await lockedWrite(tx, (w) => w.run('INSERT INTO n VALUES (3)'));
      await expect(lockedWrite(db, (w) => w.run('INSERT INTO n VALUES (4)'))).rejects.toThrow(
        /transaction handle/,
      );
    });
    const rows = await db.all<{ v: number }>('SELECT v FROM n ORDER BY v');
    expect(rows.map((r) => r.v)).toEqual([1, 2, 3]);
  });
});
