import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createdAt } from './columns.js';

/** The mock mail outbox (docs/product-specs/mail.md). */
export const outbox = sqliteTable('outbox', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  to: text('to').notNull(),
  subject: text('subject').notNull(),
  text: text('text').notNull(),
  html: text('html').notNull(),
  createdAt: createdAt(),
});

/** Consented analytics only (docs/product-specs/consent.md). */
export const analyticsEvents = sqliteTable('analytics_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id'),
  kind: text('kind').notNull(),
  path: text('path').notNull(),
  data: text('data', { mode: 'json' }).$type<Readonly<Record<string, unknown>>>(),
  createdAt: createdAt(),
});
