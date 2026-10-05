// Admin orders UI: filters through the URL, order actions and refund errors.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminOrder, AdminOrderList } from '../../src/domain/admin.js';
import { a11yViolations } from '../support/axe.js';
import {
  fakeAdmin,
  mountAdmin,
  reply,
  restoreAdmin,
  type FakeRequest,
} from '../support/admin-browser.js';

const NUMBER = 'GG-20261004-ABCDEF';

const list: AdminOrderList = {
  rows: [
    {
      number: NUMBER,
      status: 'paid',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      placedAt: '2026-10-04T12:00:00.000Z',
      totalCents: 5413,
      refundedCents: 0,
      items: 1,
    },
  ],
  page: 1,
  pages: 1,
  total: 1,
};

const order = (status: AdminOrder['status'], actions: AdminOrder['actions']): AdminOrder => ({
  number: NUMBER,
  status,
  email: 'ada@example.com',
  placedAt: '2026-10-04T12:00:00.000Z',
  lines: [{ name: 'Brick set', variant: '', quantity: 1, unitCents: 5000, totalCents: 5000 }],
  totals: { subtotal: 5000, discount: 0, shipping: 0, tax: 413, total: 5413 },
  refundedCents: 0,
  refundableCents: 5413,
  promoCode: null,
  address: {
    name: 'Ada Lovelace',
    line1: '1 Analytical Way',
    line2: '',
    city: 'Albany',
    state: 'NY',
    postalCode: '12207',
  },
  shipping: 'Standard',
  payment: { brand: 'Visa', last4: '4242' },
  events: [{ status: 'paid', note: null, at: '2026-10-04T12:00:00.000Z' }],
  actions,
});

afterEach(() => {
  restoreAdmin();
});

describe('order list', () => {
  it('lists orders and filters through the URL', async () => {
    const { router } = fakeAdmin('/admin/orders', () => list);
    const el = await mountAdmin('/admin/orders');
    await vi.waitFor(() => {
      expect(el.querySelector('[data-component="order-row"]')).not.toBeNull();
    });
    expect(el.querySelector('caption')?.textContent.trim()).toBe('1 order');
    const status = el.querySelector('select[name="status"]');
    if (!(status instanceof HTMLSelectElement)) throw new Error('no status filter');
    status.value = 'paid';
    el.querySelector<HTMLFormElement>('form[data-component="order-filters"]')?.requestSubmit();
    await vi.waitFor(() => {
      expect(router.snapshot().href).toMatch(/\/admin\/orders\?status=paid$/);
    });
    expect(await a11yViolations(document.body)).toEqual([]);
  });
});

describe('order detail', () => {
  it('ships an order and shows the new state', async () => {
    let current = order('paid', ['Fulfil', 'Cancel', 'Refund']);
    const { http } = fakeAdmin(`/admin/orders/${NUMBER}`, (req: FakeRequest) => {
      if (req.method === 'POST') {
        current = order('fulfilled', ['Deliver', 'Refund']);
        return { _tag: 'Transitioned', status: 'fulfilled', notice: 'Marked as shipped.' };
      }
      return current;
    });
    const el = await mountAdmin(`/admin/orders/${NUMBER}`);
    await vi.waitFor(() => {
      expect(el.querySelector('[data-component="order-action"]')).not.toBeNull();
    });
    expect(await a11yViolations(document.body)).toEqual([]);
    const ship = [...el.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Mark as shipped'),
    );
    ship?.click();
    await vi.waitFor(() => {
      expect(el.querySelector('[role="status"][data-kind="success"]')?.textContent.trim()).toBe(
        'Marked as shipped.',
      );
      expect(
        [...el.querySelectorAll('button')].some((b) => b.textContent.includes('Mark as delivered')),
      ).toBe(true);
    });
    const post = http.inputs.find((r) => r.method === 'POST');
    expect(post?.url).toBe(`/api/admin/orders/${NUMBER}/transition`);
    expect(
      post?.body instanceof FormData ? Object.fromEntries(post.body) : post?.body,
    ).toMatchObject({
      action: 'Fulfil',
    });
  });

  it('shows the schema’s amount error, then the server’s conflict message', async () => {
    fakeAdmin(`/admin/orders/${NUMBER}`, (req) => {
      if (req.method === 'POST') {
        return reply(409, {
          error: 'conflict',
          message: 'The payment provider refused the refund. Nothing was refunded.',
        });
      }
      return order('paid', ['Fulfil', 'Cancel', 'Refund']);
    });
    const el = await mountAdmin(`/admin/orders/${NUMBER}`);
    await vi.waitFor(() => {
      expect(el.querySelector('form[data-component="refund-form"]')).not.toBeNull();
    });
    const amount = el.querySelector('#refund-amount');
    if (!(amount instanceof HTMLInputElement)) throw new Error('no amount field');
    amount.value = 'lots'; // passes the native check, fails the schema
    el.querySelector<HTMLFormElement>('form[data-component="refund-form"]')?.requestSubmit();
    await vi.waitFor(() => {
      expect(el.querySelector('#refund-amount-error')?.textContent).toMatch(/like 19\.99/);
    });
    amount.value = '5.00';
    amount.dispatchEvent(new Event('input', { bubbles: true }));
    el.querySelector<HTMLFormElement>('form[data-component="refund-form"]')?.requestSubmit();
    await vi.waitFor(() => {
      expect(el.querySelector('[role="alert"]')?.textContent).toMatch(/refused the refund/);
    });
  });
});
