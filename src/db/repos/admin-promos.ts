// Admin promo-code queries (docs/product-specs/admin.md, ADR 0003). Writes take a transaction
// handle from writeTransaction (src/db/tx.ts).
import { and, asc, eq, ne } from 'drizzle-orm';
import type { Db } from '../client.js';
import { departments, promoCodes } from '../schema.js';
import type { Tx } from '../tx.js';

type Reader = Db | Tx;

export interface PromoFields {
  readonly code: string;
  readonly kind: 'percent' | 'fixed';
  readonly amount: number;
  readonly minSubtotalCents: number;
  readonly departmentId: number | null;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly usageLimit: number | null;
  readonly active: boolean;
}

const columns = {
  id: promoCodes.id,
  code: promoCodes.code,
  kind: promoCodes.kind,
  amount: promoCodes.amount,
  minSubtotalCents: promoCodes.minSubtotalCents,
  departmentId: promoCodes.departmentId,
  department: departments.name,
  startsAt: promoCodes.startsAt,
  endsAt: promoCodes.endsAt,
  usageLimit: promoCodes.usageLimit,
  usedCount: promoCodes.usedCount,
  active: promoCodes.active,
};

export type PromoRecord = Awaited<ReturnType<typeof listPromos>>[number];

export function listPromos(db: Reader) {
  return db
    .select(columns)
    .from(promoCodes)
    .leftJoin(departments, eq(departments.id, promoCodes.departmentId))
    .orderBy(asc(promoCodes.code));
}

export async function findPromo(db: Reader, id: number): Promise<PromoRecord | undefined> {
  const [row] = await db
    .select(columns)
    .from(promoCodes)
    .leftJoin(departments, eq(departments.id, promoCodes.departmentId))
    .where(eq(promoCodes.id, id));
  return row;
}

export async function codeTaken(db: Reader, code: string, except: number | undefined) {
  const [row] = await db
    .select({ id: promoCodes.id })
    .from(promoCodes)
    .where(
      except === undefined
        ? eq(promoCodes.code, code)
        : and(eq(promoCodes.code, code), ne(promoCodes.id, except)),
    );
  return row !== undefined;
}

export async function departmentExists(db: Reader, id: number): Promise<boolean> {
  const [row] = await db
    .select({ id: departments.id })
    .from(departments)
    .where(eq(departments.id, id));
  return row !== undefined;
}

export async function insertPromo(tx: Tx, fields: PromoFields): Promise<number> {
  const [row] = await tx.insert(promoCodes).values(fields).returning({ id: promoCodes.id });
  if (row === undefined) throw new Error('promo insert returned nothing');
  return row.id;
}

export async function updatePromo(tx: Tx, id: number, fields: PromoFields): Promise<boolean> {
  const rows = await tx
    .update(promoCodes)
    .set(fields)
    .where(eq(promoCodes.id, id))
    .returning({ id: promoCodes.id });
  return rows.length > 0;
}

/** Deletes a code that was never used (used codes are deactivated instead). */
export async function deleteUnusedPromo(tx: Tx, id: number): Promise<'deleted' | 'used' | 'gone'> {
  const rows = await tx
    .delete(promoCodes)
    .where(and(eq(promoCodes.id, id), eq(promoCodes.usedCount, 0)))
    .returning({ id: promoCodes.id });
  if (rows.length > 0) return 'deleted';
  return (await findPromo(tx, id)) === undefined ? 'gone' : 'used';
}

export function departmentChoices(db: Reader) {
  return db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .orderBy(asc(departments.position), asc(departments.name));
}
