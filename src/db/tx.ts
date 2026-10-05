// Serialized writes. Within one process, libsql can't make a second writer wait for a
// transaction: its native driver is synchronous, so a busy timeout would block the event loop
// that the open transaction needs to finish (a self-deadlock), and without one a concurrent
// writer fails at once with SQLITE_BUSY (files) or TRANSACTION_ACTIVE (in-memory). So writes
// that must not fail take a process-wide async lock per database, and still retry on busy for
// the cross-process case (the dev server and the seed script on one file). Correctness never
// depends on this: stock and promo updates are conditional and never oversell.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Db } from './client.js';

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** A handle that may write: the database inside `lockedWrite`, or a `writeTransaction` tx. */
export type Writer = Db | Tx;

const RETRYABLE = /SQLITE_BUSY|TRANSACTION_ACTIVE|database is locked/;

const isBusy = (error: unknown): boolean =>
  error instanceof Error && (RETRYABLE.test(error.message) || RETRYABLE.test(String(error.cause)));

const tails = new WeakMap<object, Promise<unknown>>();

/**
 * Which handles the current async call chain already holds the lock for, so nested locked
 * writes (a repo write called from inside a service transaction) run directly instead of
 * waiting behind themselves. `inTransaction` marks databases with an open transaction:
 * writing through the database object there would need a second connection and deadlock.
 */
interface Held {
  readonly handles: ReadonlySet<object>;
  readonly inTransaction: ReadonlySet<object>;
}
const held = new AsyncLocalStorage<Held>();
const current = (): Held => held.getStore() ?? { handles: new Set(), inTransaction: new Set() };

/** True when this call chain holds the write lock for `handle`. */
export const holdsWriteLock = (handle: object): boolean => current().handles.has(handle);

/** Runs `write` after every earlier locked write on this database has finished. Reentrant. */
export function withWriteLock<T>(db: object, write: () => Promise<T>): Promise<T> {
  const state = current();
  if (state.inTransaction.has(db)) {
    return Promise.reject(
      new Error(
        'A locked write on the database was started inside one of its transactions. ' +
          'Pass the transaction handle (tx) to the write instead (src/db/tx.ts).',
      ),
    );
  }
  if (state.handles.has(db)) return write();
  const inner: Held = {
    handles: new Set([...state.handles, db]),
    inTransaction: state.inTransaction,
  };
  const task = () => held.run(inner, write);
  const previous = tails.get(db) ?? Promise.resolve();
  const run = previous.then(task, task);
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

/**
 * A transaction that waits its turn behind other locked writes. Inside it, write through
 * `tx` (it is held, so repo writes given `tx` run directly); writing through `db` throws.
 */
export function writeTransaction<T>(db: Writer, run: (tx: Tx) => Promise<T>): Promise<T> {
  return withWriteLock(db, () =>
    retryBusy(() =>
      db.transaction((tx) => {
        const state = current();
        const inside: Held = {
          handles: new Set([...state.handles, tx]),
          inTransaction: new Set([...state.inTransaction, db]),
        };
        return held.run(inside, () => run(tx));
      }),
    ),
  );
}

/** A single write (no transaction) that waits its turn, e.g. appending to the mail outbox. */
export function lockedWrite<T, W extends Writer>(
  handle: W,
  write: (w: W) => Promise<T>,
): Promise<T> {
  return withWriteLock(handle, () => retryBusy(() => write(handle)));
}
