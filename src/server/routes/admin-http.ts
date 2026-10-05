// Shared answers for the admin JSON API.
import type { Context } from 'hono';
import type { AppEnv } from '../security/index.js';

/** API answers are per-user and change constantly: never cache them. */
export const NO_STORE = { 'cache-control': 'no-store' } as const;

/** 403 for an authenticated non-admin (the route guard normally stops them first). */
export const forbidden = (c: Context<AppEnv>) => c.json({ error: 'forbidden' }, 403, NO_STORE);
