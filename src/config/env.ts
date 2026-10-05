import * as v from 'valibot';

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
   * The public origin of the site, used for absolute URLs (canonical links, sitemaps) in pages
   * prerendered at build time, where there is no request to take the origin from.
   */
  SITE_ORIGIN: v.optional(
    v.pipe(
      v.string(),
      v.url(),
      v.transform((u) => new URL(u).origin),
    ),
    'http://localhost:5200',
  ),
  /** Signs values such as order-confirmation access cookies. Required in production. */
  APP_SECRET: v.optional(v.pipe(v.string(), v.minLength(32))),
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
  return result.output;
}
