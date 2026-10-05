// Sign in, register, sign out and the account landing page (docs/product-specs/accounts.md).
// Each POST serves two clients: a plain form (Post/Redirect/Get, 422 re-render on errors)
// and the Gyral components, which send JSON and get the same outcome back as JSON.
import { Hono, type Context } from 'hono';
import { validateForm, type IntentRejected } from '@gyral/core';
import type { Db } from '../../db/client.js';
import { registerErrorMessage, registerMember } from '../../services/accounts.js';
import { authenticate, loginErrorMessage, normalizeEmail } from '../../services/auth.js';
import type { SessionUser } from '../../services/sessions.js';
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
type Outcome =
  | { readonly _tag: 'SignedIn'; readonly location: string }
  | { readonly _tag: 'Rejected'; readonly rejected: IntentRejected };

/** A `?next=` value worth keeping: a same-site path, else ''. */
const cleanNext = (raw: unknown): string =>
  typeof raw === 'string' && raw !== '' && safeNext(raw) === raw ? raw : '';

/** Fields from a no-JS form post, or the JSON body the components send. */
async function readForm(c: C): Promise<FormData> {
  if (!(c.req.header('content-type') ?? '').includes('application/json')) {
    return c.req.formData();
  }
  const body: unknown = await c.req.json().catch(() => ({}));
  const data = new FormData();
  if (typeof body === 'object' && body !== null) {
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string') data.append(key, value);
    }
  }
  return data;
}

/** Rejections are rendered into the page and its state: never echo passwords back. */
const withoutSecrets = (r: IntentRejected): IntentRejected =>
  r.values === undefined
    ? r
    : {
        ...r,
        values: Object.fromEntries(Object.entries(r.values).filter(([k]) => !SECRET_FIELDS.has(k))),
      };

const rejection = (
  intent: string,
  path: string,
  message: string,
  values: Readonly<Record<string, string>>,
): Outcome => ({
  _tag: 'Rejected',
  rejected: { _tag: 'IntentRejected', intent, issues: [{ path, message }], values },
});

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

  const respond = async (c: C, kind: 'login' | 'register', next: string, outcome: Outcome) => {
    if (outcome._tag === 'SignedIn') {
      return wantsJson(c) ? c.json(outcome) : c.redirect(outcome.location, 303);
    }
    const rejected = withoutSecrets(outcome.rejected);
    // JSON callers get 200: @gyral/http does not expose bodies of error statuses.
    return wantsJson(c) ? c.json(rejected) : authPage(c, kind, next, rejected);
  };

  const signIn = async (c: C, user: SessionUser, next: string, fallback: string) => {
    await startMemberSession(c, user);
    return { _tag: 'SignedIn', location: next === '' ? fallback : next } as const;
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
    const data = await readForm(c);
    const raw = data.get('email');
    const email = normalizeEmail(typeof raw === 'string' ? raw : '');
    const limited =
      (await limit(c, loginPerIp, [`ip:${ip(c)}`])) ??
      (await limit(c, loginPerAccount, [`account:${email}`]));
    if (limited !== undefined) return limited;
    const next = cleanNext(data.get('next'));
    const parsed = await validateForm(LoginForm, 'Login', data);
    if (!parsed.ok)
      return respond(c, 'login', next, { _tag: 'Rejected', rejected: parsed.rejected });
    const user = await authenticate(db, parsed.data.email, parsed.data.password);
    const outcome = user.ok
      ? await signIn(c, user.value, next, '/')
      : rejection('Login', '', loginErrorMessage(user.error), { email: parsed.data.email });
    return respond(c, 'login', next, outcome);
  });

  app.get('/account/register', async (c) => {
    return alreadyIn(c, '/account') ?? authPage(c, 'register', cleanNext(c.req.query('next')));
  });

  app.post('/account/register', async (c) => {
    const limited = await limit(c, registerPerIp, [`ip:${ip(c)}`]);
    if (limited !== undefined) return limited;
    const data = await readForm(c);
    const next = cleanNext(data.get('next'));
    const parsed = await validateForm(RegisterForm, 'Register', data);
    if (!parsed.ok) {
      return respond(c, 'register', next, { _tag: 'Rejected', rejected: parsed.rejected });
    }
    const { name, email, password } = parsed.data;
    const created = await registerMember(db, { name, email, password });
    const outcome = created.ok
      ? await signIn(c, created.value, next, '/account')
      : rejection('Register', 'email', registerErrorMessage(created.error), { name, email });
    return respond(c, 'register', next, outcome);
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
