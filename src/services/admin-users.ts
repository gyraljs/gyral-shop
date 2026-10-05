// Admin user management (docs/product-specs/admin.md, "Users"; ADR 0002). Admins only. An admin
// never demotes or disables their own account here, and the store always keeps at least one
// admin who can sign in. A role change or disabling ends the member's sessions (privilege
// change, ADR 0002).
import {
  countUsers,
  findUserRow,
  otherActiveAdmins,
  setUserState,
  userRows,
} from '../db/repos/admin-users.js';
import type { Db } from '../db/client.js';
import { writeTransaction } from '../db/tx.js';
import { ADMIN_PAGE_SIZE, type UserAction, type UserList } from '../domain/admin-manage.js';
import { err, ok, type Result } from '../domain/result.js';
import type { AdminError } from './admin-products.js';
import { requireRole, type Actor } from './authz.js';
import { destroyUserSessions } from './sessions.js';

const refuse = (message: string): Result<never, AdminError> =>
  err({ _tag: 'Invalid', issues: [{ path: '', message }] });

export async function adminUsers(
  db: Db,
  actor: Actor,
  query: { readonly q: string; readonly page: number },
): Promise<Result<UserList, AdminError>> {
  const allowed = requireRole(actor, 'admin');
  if (!allowed.ok) return err(allowed.error);
  const total = await countUsers(db, query.q);
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  if (query.page > pages) return err({ _tag: 'NotFound' });
  const rows = await userRows(db, query.q, {
    limit: ADMIN_PAGE_SIZE,
    offset: (query.page - 1) * ADMIN_PAGE_SIZE,
  });
  return ok({
    rows: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    page: query.page,
    pages,
    total,
    self: allowed.value.id,
  });
}

export interface UserUpdate {
  readonly id: number;
  readonly role: 'customer' | 'admin';
  readonly disabled: boolean;
}

const CHANGE: Readonly<
  Record<UserAction, { readonly role?: 'customer' | 'admin'; readonly disabled?: boolean }>
> = {
  promote: { role: 'admin' },
  demote: { role: 'customer' },
  disable: { disabled: true },
  enable: { disabled: false },
};

export async function changeUser(
  db: Db,
  actor: Actor,
  userId: number,
  action: UserAction,
): Promise<Result<UserUpdate, AdminError>> {
  const allowed = requireRole(actor, 'admin');
  if (!allowed.ok) return err(allowed.error);
  if (userId === allowed.value.id && (action === 'demote' || action === 'disable')) {
    return refuse('You can’t remove your own admin access or disable your own account.');
  }
  const result = await writeTransaction(db, async (tx): Promise<Result<UserUpdate, AdminError>> => {
    const target = await findUserRow(tx, userId);
    if (target === undefined) return err({ _tag: 'NotFound' });
    // Losing an active admin (demote or disable) must leave another one who can sign in.
    const losesAdmin =
      target.role === 'admin' && !target.disabled && (action === 'demote' || action === 'disable');
    if (losesAdmin && (await otherActiveAdmins(tx, userId)) === 0) {
      return refuse('The store needs at least one admin who can sign in.');
    }
    const updated = await setUserState(tx, userId, CHANGE[action]);
    return updated === undefined ? err({ _tag: 'NotFound' }) : ok({ id: userId, ...updated });
  });
  // Outside the transaction: each session ends in its own locked write.
  if (result.ok) await destroyUserSessions(db, userId);
  return result;
}
