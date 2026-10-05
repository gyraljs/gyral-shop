// Wire shapes and pure rules for admin promo codes, users and review moderation
// (docs/product-specs/admin.md). The server builds these values; the browser decodes every
// response with the same schemas (parse at the boundary).
import * as v from 'valibot';
import { parseDollars } from './admin.js';

const cents = v.pipe(v.number(), v.integer());
const count = v.pipe(v.number(), v.integer(), v.minValue(0));
const isoDate = v.pipe(v.string(), v.isoTimestamp());

export const ADMIN_PAGE_SIZE = 25;

// ── Promo codes (ADR 0003: percent or fixed, minimum, department, window, usage limit) ──

export const PROMO_STATUSES = ['active', 'scheduled', 'expired', 'used-up', 'inactive'] as const;
export type PromoStatus = (typeof PROMO_STATUSES)[number];

export const PromoRowSchema = v.object({
  id: count,
  code: v.string(),
  kind: v.picklist(['percent', 'fixed']),
  /** Basis points for percent codes (1500 = 15%), cents for fixed ones. */
  amount: count,
  minSubtotalCents: count,
  departmentId: v.nullable(count),
  department: v.nullable(v.string()),
  startsAt: v.nullable(isoDate),
  endsAt: v.nullable(isoDate),
  /** The first and last days the code works, as calendar days in the store's time zone. */
  startsOn: v.nullable(v.pipe(v.string(), v.isoDate())),
  endsOn: v.nullable(v.pipe(v.string(), v.isoDate())),
  usageLimit: v.nullable(count),
  usedCount: count,
  active: v.boolean(),
  status: v.picklist(PROMO_STATUSES),
});
export type PromoRow = v.InferOutput<typeof PromoRowSchema>;

export const PromoListSchema = v.object({ rows: v.array(PromoRowSchema) });
export type PromoList = v.InferOutput<typeof PromoListSchema>;

export const PromoEditSchema = v.object({
  promo: v.nullable(PromoRowSchema),
  departments: v.array(v.object({ id: count, name: v.string() })),
});
export type PromoEdit = v.InferOutput<typeof PromoEditSchema>;

/** Where a code stands at `now`: what a shopper entering it would experience. */
export function promoStatus(
  row: Pick<PromoRow, 'active' | 'usageLimit' | 'usedCount'> & {
    readonly startsAt: Date | null;
    readonly endsAt: Date | null;
  },
  now: Date,
): PromoStatus {
  if (!row.active) return 'inactive';
  if (row.usageLimit !== null && row.usedCount >= row.usageLimit) return 'used-up';
  if (row.endsAt !== null && now >= row.endsAt) return 'expired';
  if (row.startsAt !== null && now < row.startsAt) return 'scheduled';
  return 'active';
}

/** "15", "12.5", "12.50" (percent) → basis points 1..10000; undefined otherwise. */
export function parsePercent(text: string): number | undefined {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?%?$/.exec(text.trim());
  if (match === null) return undefined;
  const bp = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return bp >= 1 && bp <= 10_000 ? bp : undefined;
}

/** A promo amount as typed: percent text for percent codes, dollars for fixed ones. */
export function parsePromoAmount(kind: 'percent' | 'fixed', text: string): number | undefined {
  if (kind === 'percent') return parsePercent(text);
  const cents = parseDollars(text);
  return cents !== undefined && cents > 0 ? cents : undefined;
}

/** The editable text for an amount: 1250 bp → "12.5"; 500 cents → "5.00". */
export function promoAmountText(kind: 'percent' | 'fixed', amount: number): string {
  return kind === 'fixed' ? (amount / 100).toFixed(2) : String(amount / 100);
}

/** "15% off", "$5.00 off". */
export function promoAmountLabel(row: Pick<PromoRow, 'kind' | 'amount'>): string {
  return row.kind === 'percent'
    ? `${promoAmountText('percent', row.amount)}% off`
    : `$${promoAmountText('fixed', row.amount)} off`;
}

export const PROMO_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,23}$/;

// ── Users ──

export const UserListSchema = v.object({
  rows: v.array(
    v.object({
      id: count,
      name: v.string(),
      email: v.string(),
      role: v.picklist(['customer', 'admin']),
      disabled: v.boolean(),
      createdAt: isoDate,
      orders: count,
    }),
  ),
  page: count,
  pages: count,
  total: count,
  /** The signed-in admin, whose own account can't be demoted or disabled from here. */
  self: count,
});
export type UserList = v.InferOutput<typeof UserListSchema>;
export type UserRow = UserList['rows'][number];

export const USER_ACTIONS = ['promote', 'demote', 'disable', 'enable'] as const;
export type UserAction = (typeof USER_ACTIONS)[number];

export const USER_ACTION_LABEL: Readonly<Record<UserAction, string>> = {
  promote: 'Make admin',
  demote: 'Remove admin',
  disable: 'Disable account',
  enable: 'Enable account',
};

/** The actions that make sense for a row (the server re-checks every rule). */
export function userActions(row: Pick<UserRow, 'id' | 'role' | 'disabled'>, self: number) {
  if (row.id === self) return [] as UserAction[];
  const actions: UserAction[] = [row.role === 'admin' ? 'demote' : 'promote'];
  actions.push(row.disabled ? 'enable' : 'disable');
  return actions;
}

export const UserUpdatedSchema = v.object({
  _tag: v.literal('UserUpdated'),
  id: count,
  role: v.picklist(['customer', 'admin']),
  disabled: v.boolean(),
});

// ── Reviews ──

export const REVIEW_FILTERS = ['all', 'visible', 'hidden'] as const;
export type ReviewFilter = (typeof REVIEW_FILTERS)[number];

export const AdminReviewListSchema = v.object({
  rows: v.array(
    v.object({
      id: count,
      productId: count,
      product: v.string(),
      slug: v.string(),
      author: v.string(),
      rating: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5)),
      title: v.string(),
      body: v.string(),
      hidden: v.boolean(),
      helpful: count,
      createdAt: isoDate,
    }),
  ),
  page: count,
  pages: count,
  total: count,
});
export type AdminReviewList = v.InferOutput<typeof AdminReviewListSchema>;

export const ReviewModeratedSchema = v.object({
  _tag: v.literal('ReviewModerated'),
  id: count,
  hidden: v.boolean(),
  rating: v.object({ sum: cents, count }),
});
