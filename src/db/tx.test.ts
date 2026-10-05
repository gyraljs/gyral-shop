import { describe, expect, it } from 'vitest';
import { createTestDb } from './client.js';
import { lockedWrite, withWriteLock, writeTransaction } from './tx.js';

const tick = (ms: number) => new Promise((done) => setTimeout(done, ms));

describe('serialized writes', () => {
  it('runs locked writes one at a time, in order, even when one fails', async () => {
    const db = await createTestDb();
    const log: string[] = [];
    const slow = withWriteLock(db, async () => {
      log.push('a start');
      await tick(20);
      log.push('a end');
      throw new Error('a failed');
    });
    const fast = withWriteLock(db, () => {
      log.push('b');
      return Promise.resolve('b done');
    });
    await expect(slow).rejects.toThrow('a failed');
    await expect(fast).resolves.toBe('b done');
    expect(log).toEqual(['a start', 'a end', 'b']);
  });

  it('lets concurrent transactions on one in-memory client succeed instead of TRANSACTION_ACTIVE', async () => {
    const db = await createTestDb();
    await db.run('CREATE TABLE counter (n INTEGER)');
    await db.run('INSERT INTO counter VALUES (0)');
    const bump = () =>
      writeTransaction(db, async (tx) => {
        await tx.run('UPDATE counter SET n = n + 1');
        await tick(5);
      });
    await Promise.all([
      bump(),
      bump(),
      bump(),
      lockedWrite(db, () => db.run('UPDATE counter SET n = n + 10')),
    ]);
    expect((await db.all<{ n: number }>('SELECT n FROM counter'))[0]?.n).toBe(13);
  });
});
