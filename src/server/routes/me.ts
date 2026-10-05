// GET /api/me: who is signed in, for pages prerendered at build time (ADR 0016 in Gyral).
// Static pages carry no per-visitor data, so the header asks for the account after hydration.
// Never starts a session for a guest, and is never cached.
import { Hono } from 'hono';
import { firstName } from '../../domain/accounts.js';
import type { AppEnv } from '../security/index.js';

export const ME_PATH = '/api/me';

export function meRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.get(ME_PATH, (c) => {
    const user = c.get('user');
    const session = c.get('session');
    const account =
      user === undefined || session === undefined
        ? null
        : { firstName: firstName(user.name), csrfToken: session.csrfToken };
    return c.json({ account }, 200, { 'cache-control': 'no-store' });
  });
  return app;
}
