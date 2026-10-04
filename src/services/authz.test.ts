import { describe, expect, it } from 'vitest';
import { requireMember, requireOwnerOrAdmin, requireRole } from './authz.js';
import type { SessionUser } from './sessions.js';

const customer: SessionUser = { id: 1, email: 'c@x.test', name: 'C', role: 'customer' };
const admin: SessionUser = { id: 2, email: 'a@x.test', name: 'A', role: 'admin' };

describe('service guards', () => {
  it('requires a member', () => {
    expect(requireMember(undefined)).toEqual({ ok: false, error: { _tag: 'Unauthenticated' } });
    expect(requireMember(customer).ok).toBe(true);
  });

  it('requires the admin role for admin actions', () => {
    expect(requireRole(customer, 'admin')).toEqual({
      ok: false,
      error: { _tag: 'Forbidden', required: 'admin' },
    });
    expect(requireRole(admin, 'admin').ok).toBe(true);
    expect(requireRole(admin, 'customer').ok).toBe(true);
  });

  it('lets owners and admins act on a record', () => {
    expect(requireOwnerOrAdmin(customer, 1).ok).toBe(true);
    expect(requireOwnerOrAdmin(customer, 9).ok).toBe(false);
    expect(requireOwnerOrAdmin(admin, 9).ok).toBe(true);
    expect(requireOwnerOrAdmin(undefined, 1).ok).toBe(false);
  });
});
