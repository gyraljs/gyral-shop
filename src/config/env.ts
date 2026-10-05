import * as v from 'valibot';

/** An http(s) URL with nothing after the host (valibot keeps checking after a failed url()). */
function isBareOrigin(s: string): boolean {
  if (!URL.canParse(s)) return false;
  const u = new URL(s);
  const http = u.protocol === 'https:' || u.protocol === 'http:';
  return http && u.pathname === '/' && u.search === '' && u.hash === '';
}

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
   * Public origin for absolute URLs (canonical links, sitemap, structured data, email links),
   * e.g. `https://shop.example`. Behind a proxy the request URL is internal, so production
   * requires it. Paths, queries and fragments are rejected.
   */
  SITE_ORIGIN: v.optional(
    v.pipe(
      v.string(),
      v.url(),
      v.check(isBareOrigin, 'must be an http(s) origin without a path, e.g. https://shop.example'),
      v.transform((s) => new URL(s).origin),
    ),
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
  if (result.output.NODE_ENV === 'production' && result.output.SITE_ORIGIN === undefined) {
    throw new Error('Invalid environment: SITE_ORIGIN is required in production');
  }
  return result.output;
}
