import * as v from 'valibot';

/** Settings parsed once at startup (parse, don't validate: docs/design-docs/core-beliefs.md). */
const Env = v.object({
  DATABASE_URL: v.optional(v.pipe(v.string(), v.minLength(1)), 'file:data/shop.db'),
  NODE_ENV: v.optional(v.picklist(['development', 'test', 'production']), 'development'),
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
  return result.output;
}
