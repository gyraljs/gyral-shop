import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { users, sessions } from './accounts.js';
import { departments, products, variants } from './catalog.js';
import { bool, cents, createdAt, timestamp } from './columns.js';

/** A cart belongs to a guest session or to a member (merged on login: cart spec). */
export const carts = sqliteTable(
  'carts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: text('session_id').references(() => sessions.id),
    userId: integer('user_id').references(() => users.id),
    promoCode: text('promo_code'),
    updatedAt: timestamp('updated_at')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex('carts_user').on(t.userId), uniqueIndex('carts_session').on(t.sessionId)],
);

export const cartLines = sqliteTable(
  'cart_lines',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cartId: integer('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    variantId: integer('variant_id')
      .notNull()
      .references(() => variants.id),
    quantity: integer('quantity').notNull(),
  },
  (t) => [uniqueIndex('cart_lines_cart_variant').on(t.cartId, t.variantId)],
);

export const promoCodes = sqliteTable('promo_codes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** Stored uppercased. */
  code: text('code').notNull().unique(),
  kind: text('kind', { enum: ['percent', 'fixed'] }).notNull(),
  /** Percent in basis points (1500 = 15%) or a fixed amount in cents. */
  amount: integer('amount').notNull(),
  minSubtotalCents: cents('min_subtotal_cents').notNull().default(0),
  departmentId: integer('department_id').references(() => departments.id),
  startsAt: timestamp('starts_at'),
  endsAt: timestamp('ends_at'),
  usageLimit: integer('usage_limit'),
  usedCount: integer('used_count').notNull().default(0),
  active: bool('active').notNull().default(true),
});

export const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'fulfilled',
  'delivered',
  'cancelled',
  'refunded',
] as const;

export interface ShippingAddress {
  readonly name: string;
  readonly line1: string;
  readonly line2: string;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
  readonly phone: string;
}

export const orders = sqliteTable(
  'orders',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Human-facing order number, e.g. GG-20261004-4F7Q. */
    number: text('number').notNull().unique(),
    userId: integer('user_id').references(() => users.id),
    email: text('email').notNull(),
    status: text('status', { enum: ORDER_STATUSES }).notNull(),
    shippingAddress: text('shipping_address', { mode: 'json' }).$type<ShippingAddress>().notNull(),
    shippingMethod: text('shipping_method').notNull(),
    subtotalCents: cents('subtotal_cents').notNull(),
    discountCents: cents('discount_cents').notNull(),
    shippingCents: cents('shipping_cents').notNull(),
    taxCents: cents('tax_cents').notNull(),
    totalCents: cents('total_cents').notNull(),
    promoCode: text('promo_code'),
    /** Makes "place order" idempotent on double submit (checkout spec). */
    idempotencyKey: text('idempotency_key').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('orders_user').on(t.userId), index('orders_status').on(t.status)],
);

/** Lines snapshot names and prices as charged, so history never changes. */
export const orderLines = sqliteTable(
  'order_lines',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id),
    variantId: integer('variant_id')
      .notNull()
      .references(() => variants.id),
    productName: text('product_name').notNull(),
    variantLabel: text('variant_label').notNull(),
    unitPriceCents: cents('unit_price_cents').notNull(),
    quantity: integer('quantity').notNull(),
    lineTotalCents: cents('line_total_cents').notNull(),
  },
  (t) => [index('order_lines_order').on(t.orderId)],
);

/** Mock provider payment states (src/domain/payments.ts). */
export const PAYMENT_STATUSES = [
  'requires_confirmation',
  'requires_capture',
  'succeeded',
  'failed',
  'refunded',
  'partially_refunded',
] as const;

export const PAYMENT_OUTCOMES = [
  'succeed',
  'card_declined',
  'insufficient_funds',
  'processing_error',
] as const;

export const payments = sqliteTable('payments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id').references(() => orders.id),
  /** The mock provider's id, e.g. pi_…. */
  providerRef: text('provider_ref').notNull().unique(),
  status: text('status', { enum: PAYMENT_STATUSES }).notNull(),
  amountCents: cents('amount_cents').notNull(),
  refundedCents: cents('refunded_cents').notNull().default(0),
  brand: text('brand').notNull(),
  last4: text('last4').notNull(),
  // Defaults exist only so SQLite can add these columns to existing tables.
  /** Card expiry; with brand and last 4 the only card data ever stored (payments spec). */
  expMonth: integer('exp_month').notNull().default(0),
  expYear: integer('exp_year').notNull().default(0),
  /** What the mock provider will do on confirm, decided from the card number at creation. */
  outcome: text('outcome', { enum: PAYMENT_OUTCOMES }).notNull().default('succeed'),
  /** Confirm attempts so far (a processing error succeeds on retry). */
  attempts: integer('attempts').notNull().default(0),
  /** The key of the confirm request that settled this payment (idempotent retries). */
  idempotencyKey: text('idempotency_key').unique(),
  failureCode: text('failure_code'),
  createdAt: createdAt(),
});

export const inventoryLog = sqliteTable('inventory_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  variantId: integer('variant_id')
    .notNull()
    .references(() => variants.id),
  delta: integer('delta').notNull(),
  reason: text('reason').notNull(),
  actorUserId: integer('actor_user_id').references(() => users.id),
  createdAt: createdAt(),
});

export const wishlistItems = sqliteTable(
  'wishlist_items',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] })],
);

export const reviews = sqliteTable(
  'reviews',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    rating: integer('rating').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    hidden: bool('hidden').notNull().default(false),
    helpfulCount: integer('helpful_count').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('reviews_product_user').on(t.productId, t.userId)],
);

export const reviewVotes = sqliteTable(
  'review_votes',
  {
    reviewId: integer('review_id')
      .notNull()
      .references(() => reviews.id),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.reviewId, t.userId] })],
);
