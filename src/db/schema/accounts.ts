import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { bool, createdAt, timestamp } from './columns.js';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** Stored lowercased. */
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  /** `scrypt$<salt>$<hash>` (docs/design-docs/0002-security.md). */
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['customer', 'admin'] })
    .notNull()
    .default('customer'),
  disabled: bool('disabled').notNull().default(false),
  createdAt: createdAt(),
});

/** Guest and member sessions. The id is the opaque cookie value. */
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    csrfToken: text('csrf_token').notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at').notNull(),
    lastSeenAt: timestamp('last_seen_at').notNull(),
  },
  (t) => [index('sessions_user').on(t.userId)],
);

export const addresses = sqliteTable(
  'addresses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    line1: text('line1').notNull(),
    line2: text('line2').notNull().default(''),
    city: text('city').notNull(),
    /** Two-letter US state code. */
    state: text('state').notNull(),
    postalCode: text('postal_code').notNull(),
    phone: text('phone').notNull().default(''),
    isDefault: bool('is_default').notNull().default(false),
  },
  (t) => [index('addresses_user').on(t.userId)],
);

export const passwordResets = sqliteTable('password_resets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  /** SHA-256 of the emailed token; the token itself is never stored. */
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: createdAt(),
});
