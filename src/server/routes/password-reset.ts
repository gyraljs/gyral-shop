// Forgot / reset password (docs/product-specs/accounts.md, ADR 0002). The request always gets
// the same answer, so it never reveals which emails have accounts; the emailed token works
// once, for 30 minutes, and using it signs the member out everywhere else.
import { Hono, type Context } from 'hono';
import { formAction, rejectWith, seeOther } from '@gyral/ssr';
import type { IntentRejected } from '@gyral/core';
import type { Db } from '../../db/client.js';
import { normalizeEmail } from '../../services/auth.js';
import { passwordResetMail, type Mailer } from '../../services/mail.js';
import {
  completeReset,
  issueReset,
  RESET_TTL_MINUTES,
  resetIsValid,
} from '../../services/password-reset.js';
import { destroyUserSessions } from '../../services/sessions.js';
import { ResetForm, ResetRequestForm } from '../../ui/account/settings-schemas.js';
import {
  forgotPage,
  forgotSentPage,
  resetInvalidPage,
  resetPage,
} from '../../ui/pages/account-settings.js';
import type { RenderPage } from '../document.js';
import { setFlash } from '../flash.js';
import { limitedResponse, overLimit } from '../limited-form.js';
import {
  csrfTokenFor,
  ip,
  LIMITS,
  SlidingWindowLimiter,
  startMemberSession,
  type AppEnv,
} from '../security/index.js';

export interface PasswordResetOptions {
  readonly db: Db;
  readonly render: RenderPage;
  readonly mailer: Mailer;
  readonly now?: () => number;
}

type C = Context<AppEnv>;

const field = async (c: C, name: string): Promise<string> => {
  const data = await c.req.raw
    .clone()
    .formData()
    .catch(() => new FormData());
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
};

const noStore = (response: Response): Response => {
  response.headers.set('cache-control', 'no-store');
  return response;
};

export function passwordResetRoutes({
  db,
  render,
  mailer,
  now = Date.now,
}: PasswordResetOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const perIp = new SlidingWindowLimiter({ ...LIMITS.resetPerIp, now });
  const perAccount = new SlidingWindowLimiter({ ...LIMITS.resetPerAccount, now });
  const clock = () => new Date(now());

  const page = async (title: string, main: unknown, status = 200) =>
    noStore(await render({ title, noindex: true, status, main }));

  const requestView = async (c: C, rejected?: IntentRejected, status = 200) =>
    page('Reset your password', forgotPage(await csrfTokenFor(c), rejected), status);

  app.get('/account/forgot', (c) => requestView(c));

  app.post('/account/forgot', async (c) => {
    const email = normalizeEmail(await field(c, 'email'));
    const wait = overLimit(perIp, [`ip:${ip(c)}`]) ?? overLimit(perAccount, [`account:${email}`]);
    if (wait !== undefined) return limitedResponse(c, 'Submit', wait, (r) => requestView(c, r));
    return formAction(ResetRequestForm, {
      intent: 'Submit',
      valid: async (data) => {
        const issued = await issueReset(db, data.email, clock());
        if (issued !== undefined) {
          const url = new URL('/account/reset', c.req.url);
          url.searchParams.set('token', issued.token);
          await mailer.send(
            passwordResetMail({
              to: issued.to,
              name: issued.name,
              resetUrl: url.href,
              expiresInMinutes: RESET_TTL_MINUTES,
            }),
          );
        }
        // The same answer whether or not the account exists.
        return seeOther('/account/forgot/sent');
      },
      invalid: (r) => requestView(c, r, 422),
    })(c.req.raw);
  });

  app.get('/account/forgot/sent', () =>
    page('Check your email', forgotSentPage(RESET_TTL_MINUTES)),
  );

  const resetView = async (c: C, token: string, rejected?: IntentRejected, status = 200) =>
    page('Choose a new password', resetPage(await csrfTokenFor(c), token, rejected), status);

  const invalidView = () => page('This link has expired', resetInvalidPage(), 410);

  app.get('/account/reset', async (c) => {
    const token = c.req.query('token') ?? '';
    return (await resetIsValid(db, token, clock())) ? resetView(c, token) : invalidView();
  });

  app.post('/account/reset', async (c) => {
    const token = await field(c, 'token');
    return formAction(ResetForm, {
      intent: 'Submit',
      valid: async (data) => {
        const done = await completeReset(db, data.token, data.password, clock());
        if (!done.ok) return rejectWith('This reset link has expired. Ask for a new one.');
        // Every existing session ends, then this browser signs in fresh (ADR 0002).
        await destroyUserSessions(db, done.value.id);
        await startMemberSession(c, done.value);
        setFlash(c, { kind: 'success', message: 'Your password is changed. You are signed in.' });
        return seeOther('/account');
      },
      invalid: (r) => {
        const rejected: IntentRejected = { ...r, values: {} }; // never echo passwords or token
        return resetView(c, token, rejected, 422);
      },
    })(c.req.raw);
  });

  return app;
}
