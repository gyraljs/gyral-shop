// Route guards for members and admins (docs/design-docs/0002-security.md). Services check
// again with src/services/authz.ts; these guards decide what the browser sees.
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from './context.js';
import { reject } from './reject.js';
import { wantsJson } from './request.js';

export const LOGIN_PATH = '/account/login';

/** Where to send a guest: the login page, remembering the page they wanted. */
export const loginRedirect = (pathAndQuery: string): string =>
  `${LOGIN_PATH}?next=${encodeURIComponent(pathAndQuery)}`;

const guard =
  (admin: boolean): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const user = c.get('user');
    if (user === undefined) {
      if (wantsJson(c)) return c.json({ error: 'unauthenticated' }, 401);
      const url = new URL(c.req.url);
      return c.redirect(loginRedirect(url.pathname + url.search), 303);
    }
    if (admin && user.role !== 'admin') return reject(c, 'forbidden');
    return next();
  };

/** Members only: guests go to login (`?next=` brings them back); APIs get 401. */
export const requireUser = (): MiddlewareHandler<AppEnv> => guard(false);

/** Admins only: guests as above; signed-in customers get 403. */
export const requireAdmin = (): MiddlewareHandler<AppEnv> => guard(true);
