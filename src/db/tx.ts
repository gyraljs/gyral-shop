// Serialized writes. Within one process, libsql can't make a second writer wait for a
// transaction: its native driver is synchronous, so a busy timeout would block the event loop
// that the open transaction needs to finish (a self-deadlock), and without one a concurrent
// writer fails at once with SQLITE_BUSY (files) or TRANSACTION_ACTIVE (in-memory). So writes
// that must not fail take a process-wide async lock per database, and still retry on busy for
// the cross-process case (the dev server and the seed script on one file). Correctness never
// depends on this: stock and promo updates are conditional and never oversell.
import type { Db } from './client.js';

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const RETRYABLE = /SQLITE_BUSY|TRANSACTION_ACTIVE|database is locked/;

const isBusy = (error: unknown): boolean =>
  error instanceof Error && (RETRYABLE.test(error.message) || RETRYABLE.test(String(error.cause)));

const tails = new WeakMap<Db, Promise<unknown>>();

/** Runs `write` after every earlier locked write on this database has finished. */
export function withWriteLock<T>(db: Db, write: () => Promise<T>): Promise<T> {
  const previous = tails.get(db) ?? Promise.resolve();
  const run = previous.then(write, write);
  // The next writer waits for this one whether it succeeds or fails.
  tails.set(
    db,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

async function retryBusy<T>(attempt: () => Promise<T>, attempts = 40, delayMs = 10): Promise<T> {
  for (let n = 1; ; n += 1) {
    try {
      return await attempt();
    } catch (error) {
      if (!isBusy(error) || n >= attempts) throw error;
      const wait = delayMs * Math.min(n, 10) * (0.5 + Math.random());
      await new Promise((done) => setTimeout(done, wait));
    }
  }
}

/** A transaction that waits its turn behind other locked writes. */
export const writeTransaction = <T>(db: Db, run: (tx: Tx) => Promise<T>): Promise<T> =>
  withWriteLock(db, () => retryBusy(() => db.transaction(run)));

/** A single write (no transaction) that waits its turn, e.g. appending to the mail outbox. */
export const lockedWrite = <T>(db: Db, write: () => Promise<T>): Promise<T> =>
  withWriteLock(db, () => retryBusy(write));
