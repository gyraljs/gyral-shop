// Authorization guards for services (docs/design-docs/0002-security.md: role checks live in
// middleware AND in services, never only in the UI). Services that need a role take the
// acting user and call these first.
import { err, ok, type Result } from '../domain/result.js';
import type { Role, SessionUser } from './sessions.js';

export type AuthzError =
  { readonly _tag: 'Unauthenticated' } | { readonly _tag: 'Forbidden'; readonly required: Role };

/** The acting user, or undefined for a guest. */
export type Actor = SessionUser | undefined;

export function requireMember(actor: Actor): Result<SessionUser, AuthzError> {
  return actor === undefined ? err({ _tag: 'Unauthenticated' }) : ok(actor);
}

export function requireRole(actor: Actor, role: Role): Result<SessionUser, AuthzError> {
  if (actor === undefined) return err({ _tag: 'Unauthenticated' });
  // Admins may do anything a customer may.
  if (role === 'admin' && actor.role !== 'admin') return err({ _tag: 'Forbidden', required: role });
  return ok(actor);
}

/** A member may act on a record they own; admins may act on any. */
export function requireOwnerOrAdmin(
  actor: Actor,
  ownerId: number,
): Result<SessionUser, AuthzError> {
  if (actor === undefined) return err({ _tag: 'Unauthenticated' });
  if (actor.role === 'admin' || actor.id === ownerId) return ok(actor);
  return err({ _tag: 'Forbidden', required: 'admin' });
}
