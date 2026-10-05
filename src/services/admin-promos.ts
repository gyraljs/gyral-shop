// Admin promo codes (docs/product-specs/admin.md, ADR 0003). Admins only (checked here and by
// the route guard). Every write goes through writeTransaction.
import {
  codeTaken,
  deleteUnusedPromo,
  departmentChoices,
  departmentExists,
  findPromo,
  insertPromo,
  listPromos,
  updatePromo,
  type PromoFields,
  type PromoRecord,
} from '../db/repos/admin-promos.js';
import type { Db } from '../db/client.js';
import { writeTransaction } from '../db/tx.js';
import { parseDollars } from '../domain/admin.js';
import {
  parsePromoAmount,
  promoStatus,
  type PromoEdit,
  type PromoList,
  type PromoRow,
} from '../domain/admin-manage.js';
import { err, ok, type Result } from '../domain/result.js';
import { addDays } from '../domain/time-zone.js';
import type { AdminError } from './admin-products.js';
import { requireRole, type Actor } from './authz.js';

/** What the promo form submits (already checked by PromoForm). */
export interface PromoInput {
  readonly code: string;
  readonly kind: 'percent' | 'fixed';
  readonly amount: string;
  readonly minSubtotal: string;
  readonly departmentId: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly usageLimit: string;
  readonly active: 'yes' | 'no';
}

/** How a form date ("2026-11-27") becomes an instant: the start of that day. */
export type DayStart = (date: string) => Date;

/** The calendar day (YYYY-MM-DD) an instant falls on. */
export type DayOf = (instant: Date) => string;

/** Days in UTC (routes pass the store time zone's versions). */
export const utcDayStart: DayStart = (date) => new Date(`${date}T00:00:00.000Z`);
export const utcDayOf: DayOf = (instant) => instant.toISOString().slice(0, 10);

const invalid = (path: string, message: string): Result<never, AdminError> =>
  err({ _tag: 'Invalid', issues: [{ path, message }] });

function admin(actor: Actor): Result<true, AdminError> {
  const allowed = requireRole(actor, 'admin');
  return allowed.ok ? ok(true) : err(allowed.error);
}

const row = (r: PromoRecord, now: Date, dayOf: DayOf): PromoRow => ({
  ...r,
  startsAt: r.startsAt?.toISOString() ?? null,
  endsAt: r.endsAt?.toISOString() ?? null,
  startsOn: r.startsAt === null ? null : dayOf(r.startsAt),
  // endsAt is the first moment the code stops working; the last day is the one before it.
  endsOn: r.endsAt === null ? null : dayOf(new Date(r.endsAt.getTime() - 1)),
  status: promoStatus(r, now),
});

export async function adminPromos(
  db: Db,
  actor: Actor,
  now: Date,
  dayOf: DayOf = utcDayOf,
): Promise<Result<PromoList, AdminError>> {
  const allowed = admin(actor);
  if (!allowed.ok) return allowed;
  return ok({ rows: (await listPromos(db)).map((r) => row(r, now, dayOf)) });
}

export async function editablePromo(
  db: Db,
  actor: Actor,
  id: number | undefined,
  now: Date,
  dayOf: DayOf = utcDayOf,
): Promise<Result<PromoEdit, AdminError>> {
  const allowed = admin(actor);
  if (!allowed.ok) return allowed;
  const departments = await departmentChoices(db);
  if (id === undefined) return ok({ promo: null, departments });
  const found = await findPromo(db, id);
  return found === undefined
    ? err({ _tag: 'NotFound' })
    : ok({ promo: row(found, now, dayOf), departments });
}

function fieldsOf(input: PromoInput, dayStart: DayStart): PromoFields | undefined {
  const amount = parsePromoAmount(input.kind, input.amount);
  if (amount === undefined) return undefined;
  const startsAt = input.startsOn === '' ? null : dayStart(input.startsOn);
  // The last day counts in full: the code stops working when the next day starts.
  const endsAt = input.endsOn === '' ? null : dayStart(addDays(input.endsOn, 1));
  return {
    code: input.code,
    kind: input.kind,
    amount,
    minSubtotalCents: input.minSubtotal === '' ? 0 : (parseDollars(input.minSubtotal) ?? 0),
    departmentId: input.departmentId === '' ? null : Number(input.departmentId),
    startsAt,
    endsAt,
    usageLimit: input.usageLimit === '' ? null : Number(input.usageLimit),
    active: input.active === 'yes',
  };
}

export async function savePromo(
  db: Db,
  actor: Actor,
  id: number | undefined,
  input: PromoInput,
  dayStart: DayStart = utcDayStart,
): Promise<Result<{ readonly id: number }, AdminError>> {
  const allowed = admin(actor);
  if (!allowed.ok) return allowed;
  const fields = fieldsOf(input, dayStart);
  if (fields === undefined) return invalid('amount', 'Enter a valid discount.');
  if (fields.kind === 'percent' && fields.amount > 10_000) {
    return invalid('amount', 'A percent discount can be at most 100%.');
  }
  return writeTransaction(db, async (tx) => {
    if (fields.departmentId !== null && !(await departmentExists(tx, fields.departmentId))) {
      return invalid('departmentId', 'Choose a department from the list.');
    }
    if (await codeTaken(tx, fields.code, id)) {
      return invalid('code', 'Another promo already uses this code.');
    }
    if (id === undefined) return ok({ id: await insertPromo(tx, fields) });
    const existing = await findPromo(tx, id);
    if (existing === undefined) return err({ _tag: 'NotFound' } as const);
    if (fields.usageLimit !== null && fields.usageLimit < existing.usedCount) {
      return invalid(
        'usageLimit',
        `This code was already used ${String(existing.usedCount)} times; the limit can't be lower.`,
      );
    }
    await updatePromo(tx, id, fields);
    return ok({ id });
  });
}

export async function deletePromo(
  db: Db,
  actor: Actor,
  id: number,
): Promise<Result<{ readonly id: number }, AdminError>> {
  const allowed = admin(actor);
  if (!allowed.ok) return allowed;
  const outcome = await writeTransaction(db, (tx) => deleteUnusedPromo(tx, id));
  if (outcome === 'gone') return err({ _tag: 'NotFound' });
  if (outcome === 'used') {
    return invalid('', 'This code has been used, so it can only be deactivated, not deleted.');
  }
  return ok({ id });
}
