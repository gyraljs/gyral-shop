// Sign in, register, sign out and the account landing page (docs/product-specs/accounts.md).
// Each POST is a Gyral formAction: a plain form gets Post/Redirect/Get or a 422 re-render;
// the components' submitForm gets the same outcome as JSON (Gyral ADR 0008, "Round trip").
import { Hono, type Context } from 'hono';
import type { IntentRejected } from '@gyral/core';
import { formAction, rejectWith, seeOther } from '@gyral/ssr';
import type { Db } from '../../db/client.js';
import { registerErrorMessage, registerMember } from '../../services/accounts.js';
import { authenticate, loginErrorMessage, normalizeEmail } from '../../services/auth.js';
import { LoginForm, RegisterForm, SECRET_FIELDS } from '../../ui/account/schemas.js';
import { accountPage, loginPage, registerPage } from '../../ui/pages/account.js';
import type { RenderPage } from '../document.js';
import {
  csrfTokenFor,
  endSession,
  ip,
  limit,
  LIMITS,
  requireUser,
  safeNext,
  SlidingWindowLimiter,
  startMemberSession,
  wantsJson,
  type AppEnv,
} from '../security/index.js';

export interface AccountRouteOptions {
  readonly db: Db;
  readonly render: RenderPage;
  /** Clock for the rate limiters (tests pass the app clock). */
  readonly now?: () => number;
}

type C = Context<AppEnv>;

/** A `?next=` value worth keeping: a same-site path, else ''. */
const cleanNext = (raw: unknown): string =>
  typeof raw === 'string' && raw !== '' && safeNext(raw) === raw ? raw : '';

/** The posted fields, read from a copy so formAction can still parse the request. */
const peekForm = (c: C): Promise<FormData> =>
  c.req.raw
    .clone()
    .formData()
    .catch(() => new FormData());

const field = (data: FormData, name: string): string => {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
};

/** Rejections are rendered into the page and its state: never echo passwords back. */
const withoutSecrets = (r: IntentRejected): IntentRejected =>
  r.values === undefined
    ? r
    : {
        ...r,
        values: Object.fromEntries(Object.entries(r.values).filter(([k]) => !SECRET_FIELDS.has(k))),
      };

const noStore = (response: Response): Response => {
  response.headers.set('cache-control', 'no-store');
  return response;
};

export function accountRoutes({ db, render, now = Date.now }: AccountRouteOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const loginPerIp = new SlidingWindowLimiter({ ...LIMITS.loginPerIp, now });
  const loginPerAccount = new SlidingWindowLimiter({ ...LIMITS.loginPerAccount, now });
  const registerPerIp = new SlidingWindowLimiter({ ...LIMITS.registerPerIp, now });

  const authPage = async (
    c: C,
    kind: 'login' | 'register',
    next: string,
    rejected?: IntentRejected,
  ) => {
    const data = { csrfToken: await csrfTokenFor(c), next, ...(rejected ? { rejected } : {}) };
    return noStore(
      await render({
        title: kind === 'login' ? 'Sign in' : 'Create an account',
        noindex: true,
        status: rejected === undefined ? 200 : 422,
        main: kind === 'login' ? loginPage(data) : registerPage(data),
      }),
    );
  };

  // Signed-in members don't need these pages: send them where they were going.
  const alreadyIn = (c: C, fallback: string) => {
    const next = cleanNext(c.req.query('next'));
    return c.get('user') === undefined ? undefined : c.redirect(next === '' ? fallback : next, 303);
  };

  app.get('/account/login', async (c) => {
    return alreadyIn(c, '/') ?? authPage(c, 'login', cleanNext(c.req.query('next')));
  });

  app.post('/account/login', async (c) => {
    const peek = await peekForm(c);
    const email = normalizeEmail(field(peek, 'email'));
    const limited =
      (await limit(c, loginPerIp, [`ip:${ip(c)}`])) ??
      (await limit(c, loginPerAccount, [`account:${email}`]));
    if (limited !== undefined) return limited;
    const next = cleanNext(peek.get('next'));
    return formAction(LoginForm, {
      intent: 'Login',
      valid: async (data) => {
        const user = await authenticate(db, data.email, data.password);
        if (!user.ok) return rejectWith(loginErrorMessage(user.error));
        await startMemberSession(c, user.value);
        return seeOther(next === '' ? '/' : next);
      },
      invalid: (rejected) => authPage(c, 'login', next, withoutSecrets(rejected)),
    })(c.req.raw);
  });

  app.get('/account/register', async (c) => {
    return alreadyIn(c, '/account') ?? authPage(c, 'register', cleanNext(c.req.query('next')));
  });

  app.post('/account/register', async (c) => {
    const limited = await limit(c, registerPerIp, [`ip:${ip(c)}`]);
    if (limited !== undefined) return limited;
    const next = cleanNext((await peekForm(c)).get('next'));
    return formAction(RegisterForm, {
      intent: 'Register',
      valid: async ({ name, email, password }) => {
        const created = await registerMember(db, { name, email, password });
        if (!created.ok) {
          return rejectWith([{ path: 'email', message: registerErrorMessage(created.error) }]);
        }
        await startMemberSession(c, created.value);
        return seeOther(next === '' ? '/account' : next);
      },
      invalid: (rejected) => authPage(c, 'register', next, withoutSecrets(rejected)),
    })(c.req.raw);
  });

  app.post('/account/logout', async (c) => {
    await endSession(c);
    return wantsJson(c) ? c.json({ _tag: 'SignedOut' }) : c.redirect('/', 303);
  });

  app.get('/account', requireUser(), async (c) => {
    const user = c.get('user');
    if (user === undefined) return c.notFound(); // requireUser() already redirected guests
    return noStore(
      await render({
        title: 'Your account',
        noindex: true,
        main: accountPage({ ...user, csrfToken: await csrfTokenFor(c) }),
      }),
    );
  });

  return app;
}
