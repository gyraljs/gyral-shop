// Admin promo codes, users and review moderation UI (docs/product-specs/admin.md).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AdminReviewList,
  PromoEdit,
  PromoList,
  PromoRow,
  UserList,
} from '../../src/domain/admin-manage.js';
import { a11yViolations } from '../support/axe.js';
import { fakeAdmin, mountAdmin, restoreAdmin, type FakeRequest } from '../support/admin-browser.js';

const welcome: PromoRow = {
  id: 1,
  code: 'WELCOME10',
  kind: 'percent',
  amount: 1000,
  minSubtotalCents: 0,
  departmentId: null,
  department: null,
  startsAt: null,
  endsAt: null,
  startsOn: null,
  endsOn: null,
  usageLimit: null,
  usedCount: 3,
  active: true,
  status: 'active',
};
const promos: PromoList = {
  rows: [
    welcome,
    {
      ...welcome,
      id: 2,
      code: 'TOYS20',
      kind: 'fixed',
      amount: 500,
      department: 'Toys & Games',
      departmentId: 2,
      startsAt: '2026-11-27T05:00:00.000Z',
      endsAt: '2026-12-01T05:00:00.000Z',
      startsOn: '2026-11-27',
      endsOn: '2026-11-30',
      usageLimit: 10,
      usedCount: 10,
      status: 'used-up',
    },
  ],
};
const newPromo: PromoEdit = { promo: null, departments: [{ id: 2, name: 'Toys & Games' }] };

const users: UserList = {
  rows: [
    {
      id: 1,
      name: 'Ada Admin',
      email: 'ada@example.com',
      role: 'admin',
      disabled: false,
      createdAt: '2026-10-01T10:00:00.000Z',
      orders: 0,
    },
    {
      id: 2,
      name: 'Grace Hopper',
      email: 'grace@example.com',
      role: 'customer',
      disabled: false,
      createdAt: '2026-10-02T10:00:00.000Z',
      orders: 4,
    },
  ],
  page: 1,
  pages: 1,
  total: 2,
  self: 1,
};

const reviews: AdminReviewList = {
  rows: [
    {
      id: 9,
      productId: 5,
      product: 'Brick set',
      slug: 'brick-set',
      author: 'Grace',
      rating: 1,
      title: 'Spam',
      body: 'Buy now!!',
      hidden: false,
      helpful: 0,
      createdAt: '2026-10-03T10:00:00.000Z',
    },
  ],
  page: 1,
  pages: 1,
  total: 1,
};

function api(req: FakeRequest): unknown {
  const url = new URL(req.url, location.origin);
  const post = req.method === 'POST';
  if (url.pathname === '/api/admin/promos' && !post) return promos;
  if (url.pathname === '/api/admin/promos/new') return newPromo;
  if (url.pathname === '/api/admin/promos' && post) return { _tag: 'Saved', id: 7 };
  // After saving, the editor opens the new code: answer its detail request too.
  if (url.pathname === '/api/admin/promos/7' && !post) {
    return { promo: { ...welcome, id: 7, code: 'SUMMER' }, departments: newPromo.departments };
  }
  if (url.pathname === '/api/admin/users' && !post) return users;
  if (url.pathname === '/api/admin/users/2' && post) {
    return { _tag: 'UserUpdated', id: 2, role: 'customer', disabled: true };
  }
  if (url.pathname === '/api/admin/reviews' && !post) return reviews;
  if (url.pathname === '/api/admin/reviews/9/visibility') {
    return { _tag: 'ReviewModerated', id: 9, hidden: true, rating: { sum: 0, count: 0 } };
  }
  throw new Error(`unexpected request ${req.method ?? 'GET'} ${req.url}`);
}

const posted = (body: unknown) => (body instanceof FormData ? Object.fromEntries(body) : body);

afterEach(() => {
  restoreAdmin();
});

describe('promo codes', () => {
  it('lists codes with their status, window and usage', async () => {
    fakeAdmin('/admin/promos', api);
    const el = await mountAdmin('/admin/promos');
    await vi.waitFor(() => {
      expect(el.querySelectorAll('[data-component="promo-row"]')).toHaveLength(2);
    });
    const rows = [...el.querySelectorAll('[data-component="promo-row"]')].map((r) =>
      r.textContent.replace(/\s+/g, ' ').trim(),
    );
    expect(rows[0]).toContain('10% off');
    expect(rows[1]).toMatch(
      /\$5\.00 off .*Toys & Games.*Nov 27, 2026 – Nov 30, 2026.*10 of 10.*Used up/,
    );
    expect(el.querySelector('nav[aria-label="Admin"] a[aria-current="page"]')?.textContent).toBe(
      'Promo codes',
    );
    expect(await a11yViolations(document.body)).toEqual([]);
  });

  it('validates a new code in the browser, then creates it and opens it', async () => {
    const { http, router } = fakeAdmin('/admin/promos/new', api);
    const el = await mountAdmin('/admin/promos/new');
    const formEl = await vi.waitFor(() => {
      const found = el.querySelector<HTMLFormElement>('form[data-component="promo-form"]');
      if (found === null) throw new Error('no form');
      return found;
    });
    const input = (id: string) => {
      const found = el.querySelector(`#promo-${id}`);
      if (!(found instanceof HTMLInputElement)) throw new Error(id);
      return found;
    };
    input('code').value = 'SUMMER';
    input('amount').value = '250';
    formEl.requestSubmit();
    await vi.waitFor(() => {
      expect(el.querySelector('#promo-amount-error')?.textContent).toMatch(/0\.01 to 100/);
    });
    expect(http.inputs.filter((r) => r.method === 'POST')).toEqual([]);
    // Typing fires `input`, which clears the custom validity invalid() set after the rejection.
    input('amount').value = '25';
    input('amount').dispatchEvent(new Event('input', { bubbles: true }));
    formEl.requestSubmit();
    await vi.waitFor(() => {
      expect(router.snapshot().href).toMatch(/\/admin\/promos\/7$/);
    });
    expect(posted(http.inputs.find((r) => r.method === 'POST')?.body)).toMatchObject({
      code: 'SUMMER',
      kind: 'percent',
      amount: '25',
      active: 'yes',
    });
    expect(await a11yViolations(document.body)).toEqual([]);
  });
});

describe('users', () => {
  it('asks for confirmation before changing an account, and never offers it for yourself', async () => {
    const { http } = fakeAdmin('/admin/users', api);
    const el = await mountAdmin('/admin/users');
    await vi.waitFor(() => {
      expect(el.querySelectorAll('[data-component="user-row"]')).toHaveLength(2);
    });
    const [self, grace] = el.querySelectorAll('[data-component="user-row"]');
    expect(self?.querySelectorAll('button')).toHaveLength(0);
    const disable = [...(grace?.querySelectorAll('button') ?? [])].find((b) =>
      b.textContent.includes('Disable account'),
    );
    disable?.click();
    await vi.waitFor(() => {
      expect(document.activeElement?.id).toBe('confirm-title');
    });
    expect(el.querySelector('[data-region="admin-confirm"]')?.textContent).toContain(
      'Disable Grace Hopper’s account?',
    );
    expect(http.inputs.filter((r) => r.method === 'POST')).toEqual([]);
    expect(await a11yViolations(document.body)).toEqual([]);

    el.querySelector<HTMLFormElement>('form[data-component="user-confirm"]')?.requestSubmit();
    await vi.waitFor(() => {
      expect(el.querySelector('[role="status"][data-kind="success"]')?.textContent).toContain(
        'Grace Hopper’s account is disabled',
      );
    });
    expect(posted(http.inputs.find((r) => r.method === 'POST')?.body)).toMatchObject({
      userId: '2',
      action: 'disable',
      confirm: 'yes',
    });
    expect(el.querySelector('[data-region="admin-confirm"]')).toBeNull();
  });

  it('cancels a pending change without sending anything', async () => {
    const { http } = fakeAdmin('/admin/users', api);
    const el = await mountAdmin('/admin/users');
    await vi.waitFor(() => {
      expect(el.querySelectorAll('[data-component="user-action"]').length).toBeGreaterThan(0);
    });
    el.querySelector<HTMLFormElement>('[data-component="user-action"]')?.requestSubmit();
    await vi.waitFor(() => {
      expect(el.querySelector('[data-region="admin-confirm"]')).not.toBeNull();
    });
    [...el.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel')?.click();
    await vi.waitFor(() => {
      expect(el.querySelector('[data-region="admin-confirm"]')).toBeNull();
    });
    expect(http.inputs.filter((r) => r.method === 'POST')).toEqual([]);
  });
});

describe('reviews', () => {
  it('hides a review and reloads the list', async () => {
    const { http } = fakeAdmin('/admin/reviews', api);
    const el = await mountAdmin('/admin/reviews');
    await vi.waitFor(() => {
      expect(el.querySelector('[data-component="admin-review"]')).not.toBeNull();
    });
    expect(await a11yViolations(document.body)).toEqual([]);
    el.querySelector<HTMLFormElement>('form[data-component="review-moderation"]')?.requestSubmit();
    await vi.waitFor(() => {
      expect(el.querySelector('[role="status"][data-kind="success"]')?.textContent).toContain(
        'Review hidden',
      );
    });
    expect(posted(http.inputs.find((r) => r.method === 'POST')?.body)).toMatchObject({
      reviewId: '9',
      hidden: 'yes',
    });
    expect(http.inputs.filter((r) => r.url.startsWith('/api/admin/reviews?')).length).toBe(2);
  });
});
