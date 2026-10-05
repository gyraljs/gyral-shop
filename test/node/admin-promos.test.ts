// Admin promo codes API (docs/product-specs/admin.md, ADR 0003).
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as v from 'valibot';
import { promoCodes } from '../../src/db/schema/commerce.js';
import { PromoEditSchema, PromoListSchema } from '../../src/domain/admin-manage.js';
import { testApp, type TestApp } from '../support/app.js';
import { createMember, loginAs, type TestSession } from '../support/auth.js';
import { getJson, signInAdmin } from '../support/admin.js';
import { insertCartFixture, T0 } from '../support/cart-fixture.js';

let test: TestApp;
let admin: TestSession;

beforeEach(async () => {
  test = await testApp({ seed: false, now: () => T0 });
  await insertCartFixture(test.db);
  admin = await signInAdmin(test);
});

const promo = (fields: Record<string, string> = {}) => ({
  code: 'fall-25',
  kind: 'percent',
  amount: '25',
  minSubtotal: '',
  departmentId: '',
  startsOn: '',
  endsOn: '',
  usageLimit: '',
  active: 'yes',
  ...fields,
});

const issues = async (res: Response) =>
  ((await res.json()) as { issues: { path: string; message: string }[] }).issues;

describe('promo list', () => {
  it('shows every code with its rules and where it stands today', async () => {
    const { status, body } = await getJson(admin, '/api/admin/promos');
    expect(status).toBe(200);
    const list = v.parse(PromoListSchema, body);
    const byCode = Object.fromEntries(list.rows.map((r) => [r.code, r]));
    expect(byCode['WELCOME10']).toMatchObject({ kind: 'percent', amount: 1000, status: 'active' });
    expect(byCode['SAVE5']).toMatchObject({ kind: 'fixed', amount: 500, minSubtotalCents: 10000 });
    expect(byCode['TOYS20']?.department).toBe('Toys & Games');
    expect(byCode['EXPIRED']).toMatchObject({ status: 'expired', endsOn: '2025-12-31' });
    expect(byCode['OFF']?.status).toBe('inactive');
  });

  it('is admin-only, for the list and for writes', async () => {
    await createMember(test, {
      name: 'Grace',
      email: 'g@example.com',
      password: 'correct-horse-9x',
    });
    const customer = await loginAs(test, 'g@example.com');
    expect((await getJson(customer, '/api/admin/promos')).status).toBe(403);
    expect((await customer.submitForm('/api/admin/promos', promo())).status).toBe(403);
  });
});

describe('saving a promo code', () => {
  it('creates a code with a window, minimum, department and limit (dates inclusive)', async () => {
    const res = await admin.submitForm(
      '/api/admin/promos',
      promo({
        minSubtotal: '40',
        departmentId: '2',
        startsOn: '2026-11-27',
        endsOn: '2026-11-30',
        usageLimit: '100',
      }),
    );
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: number };
    const [row] = await test.db.select().from(promoCodes).where(eq(promoCodes.id, id));
    expect(row).toMatchObject({
      code: 'FALL-25',
      kind: 'percent',
      amount: 2500,
      minSubtotalCents: 4000,
      departmentId: 2,
      usageLimit: 100,
      active: true,
    });
    expect(row?.startsAt?.toISOString()).toBe('2026-11-27T00:00:00.000Z');
    // The last day counts in full: the code stops when Dec 1 starts.
    expect(row?.endsAt?.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    const edit = v.parse(
      PromoEditSchema,
      (await getJson(admin, `/api/admin/promos/${String(id)}`)).body,
    );
    expect(edit.promo).toMatchObject({
      startsOn: '2026-11-27',
      endsOn: '2026-11-30',
      status: 'scheduled',
    });
  });

  it('rejects bad input with field issues (the same checks the browser runs)', async () => {
    const cases: [Record<string, string>, string][] = [
      [{ code: 'x' }, 'code'],
      [{ amount: '150' }, 'amount'],
      [{ kind: 'fixed', amount: '0' }, 'amount'],
      [{ startsOn: '2026-12-10', endsOn: '2026-12-01' }, 'endsOn'],
      [{ usageLimit: '-3' }, 'usageLimit'],
      [{ code: 'welcome10' }, 'code'],
      [{ departmentId: '999' }, 'departmentId'],
    ];
    for (const [fields, path] of cases) {
      const res = await admin.submitForm('/api/admin/promos', promo(fields));
      expect(res.status, JSON.stringify(fields)).toBe(422);
      expect(
        (await issues(res)).map((i) => i.path),
        JSON.stringify(fields),
      ).toContain(path);
    }
  });

  it('keeps a usage limit at or above the times a code was already used', async () => {
    await test.db.update(promoCodes).set({ usedCount: 7 }).where(eq(promoCodes.code, 'WELCOME10'));
    const [row] = await test.db.select().from(promoCodes).where(eq(promoCodes.code, 'WELCOME10'));
    const id = String(row?.id);
    const low = await admin.submitForm(
      `/api/admin/promos/${id}`,
      promo({ code: 'WELCOME10', usageLimit: '5' }),
    );
    expect(low.status).toBe(422);
    expect((await issues(low))[0]?.path).toBe('usageLimit');
    const ok = await admin.submitForm(
      `/api/admin/promos/${id}`,
      promo({ code: 'WELCOME10', usageLimit: '7' }),
    );
    expect(ok.status).toBe(200);
  });
});

describe('deleting a promo code', () => {
  it('deletes an unused code and refuses a used one', async () => {
    const rows = await test.db.select().from(promoCodes);
    const id = (code: string) => String(rows.find((r) => r.code === code)?.id);
    expect(
      (await admin.submitForm(`/api/admin/promos/${id('OFF')}/delete`, { confirm: 'yes' })).status,
    ).toBe(200);
    expect(await test.db.select().from(promoCodes).where(eq(promoCodes.code, 'OFF'))).toEqual([]);

    await test.db.update(promoCodes).set({ usedCount: 1 }).where(eq(promoCodes.code, 'SAVE5'));
    const used = await admin.submitForm(`/api/admin/promos/${id('SAVE5')}/delete`, {
      confirm: 'yes',
    });
    expect(used.status).toBe(422);
    expect((await issues(used))[0]).toMatchObject({ path: '' });
    expect((await admin.submitForm(`/api/admin/promos/${id('SAVE5')}/delete`, {})).status).toBe(
      422,
    );
    expect(
      (await admin.submitForm('/api/admin/promos/9999/delete', { confirm: 'yes' })).status,
    ).toBe(404);
  });

  it('refuses writes without the CSRF token', async () => {
    const res = await admin.get('/api/admin/promos', {
      method: 'POST',
      headers: { accept: 'application/json' },
      body: new URLSearchParams(promo()),
    });
    expect(res.status).toBe(403);
  });
});
