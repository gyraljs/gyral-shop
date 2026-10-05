// Housekeeping (docs/design-docs/0002-security.md, sessions): expired sessions and the guest
// carts they leave behind. destroySession() detaches a guest cart (session_id → null); with no
// member either, nothing can reach it again, so it is deleted (lines and checkout draft cascade).
import { and, isNull } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { carts } from '../db/schema.js';
import { lockedWrite } from '../db/tx.js';
import { purgeExpiredSessions } from './sessions.js';

/** Deletes carts that belong to neither a session nor a member; returns how many. */
export async function purgeOrphanedCarts(db: Db): Promise<number> {
  const deleted = await lockedWrite(db, (w) =>
    w
      .delete(carts)
      .where(and(isNull(carts.sessionId), isNull(carts.userId)))
      .returning({ id: carts.id }),
  );
  return deleted.length;
}

export interface PurgeResult {
  readonly sessions: number;
  readonly carts: number;
}

/** Expired sessions first (that orphans their guest carts), then orphaned carts. */
export async function purgeStale(db: Db, now: Date = new Date()): Promise<PurgeResult> {
  const sessions = await purgeExpiredSessions(db, now);
  const orphaned = await purgeOrphanedCarts(db);
  return { sessions, carts: orphaned };
}

/** Hourly by default. Short enough that orphaned carts don't pile up, rare enough to be free. */
export const PURGE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Runs purgeStale() now and then every `intervalMs` in this process (dev and production
 * servers). Failures are logged and retried on the next tick. Returns a stop function; the
 * timer never keeps the process alive.
 */
export function startPurgeSchedule(
  db: Db,
  options: {
    readonly intervalMs?: number;
    readonly now?: () => Date;
    readonly log?: (message: string) => void;
  } = {},
): () => void {
  const log =
    options.log ??
    ((m: string) => {
      console.log(m);
    });
  let running = false;
  const tick = async () => {
    if (running) return; // a slow purge never overlaps the next one
    running = true;
    try {
      const result = await purgeStale(db, options.now?.() ?? new Date());
      if (result.sessions + result.carts > 0) {
        log(`purged ${String(result.sessions)} sessions, ${String(result.carts)} guest carts`);
      }
    } catch (error) {
      console.error('purge failed (will retry on the next tick)', error);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), options.intervalMs ?? PURGE_INTERVAL_MS);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
