import { integer } from 'drizzle-orm/sqlite-core';

/** Timestamps are stored as epoch milliseconds and read as Date. */
export const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });

/** `created_at`, defaulting to now. */
export const createdAt = () =>
  timestamp('created_at')
    .notNull()
    .$defaultFn(() => new Date());

/** Money columns are integer cents (docs/design-docs/0003-money-and-pricing.md). */
export const cents = (name: string) => integer(name);

export const bool = (name: string) => integer(name, { mode: 'boolean' });
