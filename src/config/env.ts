import * as v from 'valibot';
import { isTimeZone } from '../domain/time-zone.js';

/** An http(s) URL with nothing after the host (valibot keeps checking after a failed url()). */
function isBareOrigin(s: string): boolean {
  if (!URL.canParse(s)) return false;
  const u = new URL(s);
  const http = u.protocol === 'https:' || u.protocol === 'http:';
  return http && u.pathname === '/' && u.search === '' && u.hash === '';
}

/** The seeded admin's password when SEED_ADMIN_PASSWORD is unset. Public: development only. */
export const DEFAULT_ADMIN_PASSWORD = 'gyral-admin-2026';

/** A boolean switch: 1/true/yes/on or 0/false/no/off (any case). */
const flag = v.pipe(
  v.string(),
  v.toLowerCase(),
  v.picklist(['1', 'true', 'yes', 'on', '0', 'false', 'no', 'off']),
  v.transform((s) => ['1', 'true', 'yes', 'on'].includes(s)),
);

/** A local wall-clock time, 24-hour HH:MM, as minutes after midnight. */
const clockTime = v.pipe(
  v.string(),
  v.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be a 24-hour time such as 03:00'),
  v.transform((s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3))),
);

/** Settings parsed once at startup (parse, don't validate: docs/design-docs/core-beliefs.md). */
const Env = v.object({
  DATABASE_URL: v.optional(v.pipe(v.string(), v.minLength(1)), 'file:data/shop.db'),
  NODE_ENV: v.optional(v.picklist(['development', 'test', 'production']), 'development'),
  /** Artificial delay for mock payment calls, so loading states are visible (payments spec). */
  PAYMENT_LATENCY_MS: v.optional(
    v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(0), v.maxValue(10_000)),
    '0',
  ),
  /**
   * Public origin for absolute URLs: canonical links, sitemap, robots, structured data, email
   * links, and pages prerendered at build time (where there is no request to take it from).
   * Behind a proxy the request URL is internal, so production requires it. Bare http(s) origins
   * only. Unset in development: requests use their own origin, prerendering uses localhost.
   */
  SITE_ORIGIN: v.optional(
    v.pipe(
      v.string(),
      v.url(),
      v.check(isBareOrigin, 'must be an http(s) origin without a path, e.g. https://shop.example'),
      v.transform((s) => new URL(s).origin),
    ),
  ),
  /** The store's IANA time zone: dashboard days and promo dates use its calendar. */
  STORE_TIME_ZONE: v.optional(
    v.pipe(v.string(), v.check(isTimeZone, 'Use an IANA time zone such as America/New_York.')),
    'America/New_York',
  ),
  /** Signs values such as order-confirmation access cookies. Required in production. */
  APP_SECRET: v.optional(v.pipe(v.string(), v.minLength(32))),
  /**
   * Trust X-Forwarded-For/Proto/Host for the client address (rate limits) and the forwarded
   * origin (CSRF). Set it only when the app is reachable solely through a proxy that overwrites
   * those headers (e.g. Traefik, which by default replaces what the client sent); otherwise any
   * client could pick its own rate-limit key. Default off.
   */
  TRUST_PROXY: v.optional(flag, '0'),
  /**
   * Demo mode: every day at this local time (HH:MM in STORE_TIME_ZONE) the server puts the
   * database back to the freshly seeded state, and it migrates and seeds an empty database at
   * startup (src/services/demo.ts). Unset: no resets, no seeding at startup.
   */
  DEMO_RESET_AT: v.optional(clockTime),
  /**
   * The seeded admin's password (`pnpm db:seed`, demo seeding and resets). Defaults to the
   * public DEFAULT_ADMIN_PASSWORD, which production refuses.
   */
  SEED_ADMIN_PASSWORD: v.optional(v.pipe(v.string(), v.minLength(12))),
});

export type Config = v.InferOutput<typeof Env>;

export function loadConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Config {
  const result = v.safeParse(Env, env);
  if (!result.success) {
    const issues = result.issues.map((i) => `${v.getDotPath(i) ?? '?'}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  if (result.output.NODE_ENV === 'production' && result.output.APP_SECRET === undefined) {
    throw new Error('Invalid environment: APP_SECRET is required in production (32+ characters)');
  }
  if (result.output.NODE_ENV === 'production' && result.output.SITE_ORIGIN === undefined) {
    throw new Error('Invalid environment: SITE_ORIGIN is required in production');
  }
  if (result.output.NODE_ENV === 'production' && result.output.DEMO_RESET_AT !== undefined) {
    seedAdminPassword(result.output); // demo mode seeds: refuse the public default up front
  }
  return result.output;
}

/**
 * The password to give the seeded admin. In production it must be set and must not be the
 * public default, which anyone who reads the repository knows.
 */
export function seedAdminPassword(
  config: Pick<Config, 'NODE_ENV' | 'SEED_ADMIN_PASSWORD'>,
): string {
  const password = config.SEED_ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;
  if (config.NODE_ENV === 'production' && password === DEFAULT_ADMIN_PASSWORD) {
    throw new Error(
      'Invalid environment: set SEED_ADMIN_PASSWORD (12+ characters, not the public default) ' +
        'to seed in production',
    );
  }
  return password;
}
