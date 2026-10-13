// Puts a live database back to the freshly seeded state (the nightly demo reset,
// src/services/demo.ts). One write transaction empties every application table, restarts the
// AUTOINCREMENT counters and writes the seed again, so:
//
// - Readers never see a half-reset store: under WAL they read the last committed snapshot (the
//   old store) until the commit, then the new one. Nothing waits on the reset to read.
// - Writers in this process wait their turn behind it (the write lock in ../tx.ts), and a write
//   from another process gets SQLITE_BUSY and is retried by ../tx.ts. None interleaves with it.
// - If anything fails (a full disk, a crash, a bug), SQLite rolls the whole transaction back and
//   the old store stays as it was. There is no moment with a missing or partial database file.
//
// Tables are found in sqlite_master rather than listed by hand, so a table added by a later
// migration is emptied too. Foreign keys are checked at the commit (defer_foreign_keys), so the
// deletion order doesn't matter. Virtual tables (the FTS5 search index) are emptied through
// their own interface; their shadow tables are never touched directly.
import { sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import { writeTransaction, type Tx } from '../tx.js';
import type { SeedData } from './generate.js';
import { insertSeedRows } from './insert.js';

interface TableRow {
  readonly name: string;
  readonly sql: string | null;
}

const KEEP = /^(sqlite_|__drizzle_)/; // SQLite's own tables and drizzle's migration journal

/** The tables to empty: plain tables and virtual tables, without the virtual tables' shadows. */
export async function resettableTables(tx: Db | Tx): Promise<readonly string[]> {
  const rows = await tx.all<TableRow>(
    sql`SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name`,
  );
  const virtual = rows
    .filter((r) => r.sql?.startsWith('CREATE VIRTUAL TABLE') === true)
    .map((r) => r.name);
  const shadow = (name: string) => virtual.some((v) => name.startsWith(`${v}_`));
  return rows.map((r) => r.name).filter((name) => !KEEP.test(name) && !shadow(name));
}

const quoted = (name: string): string => `"${name.replaceAll('"', '""')}"`;

/** Empties every application table and writes the seed again, atomically (see above). */
export async function resetToSeed(
  db: Db,
  data: SeedData,
  passwordHashes: ReadonlyMap<string, string>,
): Promise<void> {
  await writeTransaction(db, async (tx) => {
    await tx.run(sql`PRAGMA defer_foreign_keys = ON`); // ends with the transaction
    for (const table of await resettableTables(tx)) {
      await tx.run(sql.raw(`DELETE FROM ${quoted(table)}`));
    }
    // Seeded rows get the same ids as in a fresh database, and new rows count from there.
    await tx.run(sql`DELETE FROM sqlite_sequence`);
    await insertSeedRows(tx, data, passwordHashes);
  });
}
