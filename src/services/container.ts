// The app's services, built in one place (shop-6p6) and handed to routes through AppOptions.
// Tests replace individual services (a fake payment provider, a fixed clock) without touching
// route code.
import { randomBytes } from 'node:crypto';
import type { Db } from '../db/client.js';
import { createMailer, type Mailer } from './mail.js';
import { createPaymentProvider, type PaymentProvider } from './payments.js';

/** Bumped when departments, categories or brands change, so cached navigation reloads. */
export interface CatalogChanges {
  readonly version: () => number;
  readonly changed: () => void;
}

/** A fresh change counter (one per app; demo resets share it with the app: src/server/prod.ts). */
export function catalogChanges(): CatalogChanges {
  let version = 0;
  return {
    version: () => version,
    changed: () => {
      version += 1;
    },
  };
}

export interface Services {
  readonly db: Db;
  readonly catalog: CatalogChanges;
  readonly mailer: Mailer;
  readonly payments: PaymentProvider;
  /** The clock every service uses (tests pass a fixed one). */
  readonly now: () => Date;
  /** Key for signed values such as order-confirmation access cookies. */
  readonly secret: string;
  /** The store's IANA time zone (config STORE_TIME_ZONE). */
  readonly timeZone: string;
}

export interface ServiceOptions {
  readonly db: Db;
  readonly now?: () => Date;
  /** Artificial delay for mock payment calls (config PAYMENT_LATENCY_MS). */
  readonly paymentLatencyMs?: number;
  /** Config APP_SECRET. Without one, a random per-process key (signed values die on restart). */
  readonly secret?: string;
  /** Config STORE_TIME_ZONE (default America/New_York, the config default). */
  readonly timeZone?: string;
  readonly mailer?: Mailer;
  readonly payments?: PaymentProvider;
  /** Shared with code outside the app that changes the catalog (the nightly demo reset). */
  readonly catalog?: CatalogChanges;
}

export function createServices(options: ServiceOptions): Services {
  const { db } = options;
  const now = options.now ?? (() => new Date());
  return {
    db,
    now,
    catalog: options.catalog ?? catalogChanges(),
    secret: options.secret ?? randomBytes(32).toString('hex'),
    timeZone: options.timeZone ?? 'America/New_York',
    mailer: options.mailer ?? createMailer(db),
    payments:
      options.payments ??
      createPaymentProvider(db, { now, latencyMs: options.paymentLatencyMs ?? 0 }),
  };
}
