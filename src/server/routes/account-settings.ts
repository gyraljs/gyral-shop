// Account settings: overview, name, email, password, address book
// (docs/product-specs/accounts.md). Members only. Every POST is a Gyral formAction, so a plain
// form gets Post/Redirect/Get (with a flash message) or a 422 re-render, and the components'
// submitForm gets the same outcome as JSON.
import { Hono, type Context } from 'hono';
import { formAction, rejectWith, seeOther } from '@gyral/ssr';
import type { IntentRejected } from '@gyral/core';
import type { Db } from '../../db/client.js';
import {
  addAddress,
  deleteAddress,
  findAddress,
  listAddresses,
  setDefaultAddress,
  updateAddress,
} from '../../db/repos/addresses.js';
import { addressLines } from '../../domain/checkout.js';
import {
  changeEmail,
  changePassword,
  profileErrorMessage,
  updateName,
} from '../../services/profile.js';
import { destroyUserSessions } from '../../services/sessions.js';
import {
  AddressBookForm,
  EmailForm,
  PasswordForm,
  ProfileForm,
  SETTINGS_SECRETS,
} from '../../ui/account/settings-schemas.js';
import {
  accountOverview,
  addressesPage,
  editAddressPage,
  passwordPage,
  profilePage,
  type Notice,
} from '../../ui/pages/account-settings.js';
import type { RenderPage } from '../document.js';
import { setFlash, takeFlash } from '../flash.js';
import { limitedResponse, overLimit } from '../limited-form.js';
import {
  csrfTokenFor,
  LIMITS,
  requireUser,
  SlidingWindowLimiter,
  startMemberSession,
  type AppEnv,
} from '../security/index.js';
import { ROUTE_CHUNKS, type RouteChunk } from '../route-chunks.js';

export interface AccountSettingsOptions {
  readonly db: Db;
  readonly render: RenderPage;
  readonly now?: () => number;
}

type C = Context<AppEnv>;

const SECRETS = new Set<string>(SETTINGS_SECRETS);

/** Rejections are rendered into the page and its state: never echo passwords back. */
const withoutSecrets = (r: IntentRejected): IntentRejected =>
  r.values === undefined
    ? r
    : {
        ...r,
        values: Object.fromEntries(Object.entries(r.values).filter(([k]) => !SECRETS.has(k))),
      };

const noStore = (response: Response): Response => {
  response.headers.set('cache-control', 'no-store');
  return response;
};

/** The signed-in member (requireUser() runs first on every route here). */
const member = (c: C) => {
  const user = c.get('user');
  if (user === undefined) throw new Error('account settings: requireUser() did not run');
  return user;
};

const flashOf = (c: C): Notice | undefined => takeFlash(c);

const done = (c: C, location: string, message: string) => {
  setFlash(c, { kind: 'success', message });
  return seeOther(location);
};

const addressId = (c: C): number | undefined => {
  const id = Number(c.req.param('id'));
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
};

const toAddress = (d: {
  name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
}) => ({
  name: d.name,
  line1: d.line1,
  line2: d.line2,
  city: d.city,
  state: d.state,
  postalCode: d.postalCode,
  phone: d.phone,
});

const FORMS: readonly RouteChunk[] = [ROUTE_CHUNKS.settings];

export function accountSettingsRoutes({
  db,
  render,
  now = Date.now,
}: AccountSettingsOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  // Wrong-current-password guesses: per account, like login.
  const passwordChecks = new SlidingWindowLimiter({ ...LIMITS.loginPerAccount, now });

  // Every settings page but the overview has a member form (settings-forms.ts).
  const page = async (c: C, title: string, main: unknown, status = 200, chunks = FORMS) =>
    noStore(await render({ title, noindex: true, status, main, chunks }));

  // Per route, not app.use('/account/*'): that would also guard sign-in and registration,
  // which other route modules serve under the same prefix.
  const members = requireUser();

  app.get('/account', members, async (c) => {
    const user = member(c);
    const [first] = await listAddresses(db, user.id);
    const flash = flashOf(c);
    return page(
      c,
      'Your account',
      accountOverview({
        ...user,
        csrfToken: await csrfTokenFor(c),
        ...(first === undefined ? {} : { defaultAddress: addressLines(first) }),
        ...(flash === undefined ? {} : { flash }),
      }),
      200,
      [],
    );
  });

  // Name and email.

  const profile = async (
    c: C,
    rejected?: { form: 'profile' | 'email'; issue: IntentRejected },
    status = 200,
  ) => {
    const user = member(c);
    const flash = flashOf(c);
    return page(
      c,
      'Name and email',
      profilePage({
        csrfToken: await csrfTokenFor(c),
        name: user.name,
        email: user.email,
        ...(flash === undefined ? {} : { flash }),
        ...(rejected === undefined ? {} : { rejected }),
      }),
      status,
    );
  };

  app.get('/account/profile', members, (c) => profile(c));

  app.post('/account/profile', members, (c) =>
    formAction(ProfileForm, {
      intent: 'Submit',
      valid: async ({ name }) => {
        await updateName(db, member(c).id, name);
        return done(c, '/account/profile', 'Your name is saved.');
      },
      invalid: (r) => profile(c, { form: 'profile', issue: r }, 422),
    })(c.req.raw),
  );

  app.post('/account/email', members, async (c) => {
    const user = member(c);
    const wait = overLimit(passwordChecks, [`account:${String(user.id)}`]);
    if (wait !== undefined) {
      return limitedResponse(c, 'Submit', wait, (r) => profile(c, { form: 'email', issue: r }));
    }
    return formAction(EmailForm, {
      intent: 'Submit',
      valid: async ({ email, current }) => {
        const changed = await changeEmail(db, user.id, current, email);
        if (!changed.ok) {
          const path = changed.error._tag === 'EmailTaken' ? 'email' : 'current';
          return rejectWith([{ path, message: profileErrorMessage(changed.error) }]);
        }
        // A changed identity gets a fresh session id (ADR 0002: privilege/identity change).
        await startMemberSession(c, { ...user, email: changed.value });
        return done(c, '/account/profile', `Your email is now ${changed.value}.`);
      },
      invalid: (r) => profile(c, { form: 'email', issue: withoutSecrets(r) }, 422),
    })(c.req.raw);
  });

  // Password.

  const passwordView = async (c: C, rejected?: IntentRejected, status = 200) => {
    const flash = flashOf(c);
    return page(
      c,
      'Change your password',
      passwordPage({
        csrfToken: await csrfTokenFor(c),
        ...(flash === undefined ? {} : { flash }),
        ...(rejected === undefined ? {} : { rejected }),
      }),
      status,
    );
  };

  app.get('/account/password', members, (c) => passwordView(c));

  app.post('/account/password', members, async (c) => {
    const user = member(c);
    const wait = overLimit(passwordChecks, [`account:${String(user.id)}`]);
    if (wait !== undefined) return limitedResponse(c, 'Submit', wait, (r) => passwordView(c, r));
    return formAction(PasswordForm, {
      intent: 'Submit',
      valid: async ({ current, password }) => {
        const changed = await changePassword(db, user.id, current, password);
        if (!changed.ok) {
          return rejectWith([{ path: 'current', message: profileErrorMessage(changed.error) }]);
        }
        // Sign out every other device, then rotate this session (ADR 0002).
        await destroyUserSessions(db, user.id, { except: c.get('session')?.id ?? '' });
        await startMemberSession(c, user);
        return done(c, '/account/password', 'Your password is changed.');
      },
      invalid: (r) => passwordView(c, withoutSecrets(r), 422),
    })(c.req.raw);
  });

  // Address book.

  const addressBook = async (c: C, rejected?: IntentRejected, status = 200) => {
    const flash = flashOf(c);
    return page(
      c,
      'Your addresses',
      addressesPage({
        csrfToken: await csrfTokenFor(c),
        addresses: await listAddresses(db, member(c).id),
        ...(flash === undefined ? {} : { flash }),
        ...(rejected === undefined ? {} : { rejected }),
      }),
      status,
    );
  };

  app.get('/account/addresses', members, (c) => addressBook(c));

  app.post('/account/addresses', members, (c) =>
    formAction(AddressBookForm, {
      intent: 'Submit',
      valid: async (data) => {
        await addAddress(db, member(c).id, toAddress(data), data.isDefault === 'on');
        return done(c, '/account/addresses', 'Address saved.');
      },
      invalid: (r) => addressBook(c, r, 422),
    })(c.req.raw),
  );

  const editView = async (c: C, id: number, rejected?: IntentRejected, status = 200) => {
    const address = await findAddress(db, member(c).id, id);
    if (address === undefined) return c.notFound();
    return page(
      c,
      'Edit address',
      editAddressPage({
        csrfToken: await csrfTokenFor(c),
        address,
        ...(rejected === undefined ? {} : { rejected }),
      }),
      status,
    );
  };

  app.get('/account/addresses/:id/edit', members, (c) => {
    const id = addressId(c);
    return id === undefined ? c.notFound() : editView(c, id);
  });

  app.post('/account/addresses/:id', members, (c) => {
    const id = addressId(c);
    if (id === undefined) return c.notFound();
    return formAction(AddressBookForm, {
      intent: 'Submit',
      valid: async (data) => {
        const saved = await updateAddress(
          db,
          member(c).id,
          id,
          toAddress(data),
          data.isDefault === 'on',
        );
        return saved
          ? done(c, '/account/addresses', 'Address updated.')
          : rejectWith('That address no longer exists.');
      },
      invalid: (r) => editView(c, id, r, 422),
    })(c.req.raw);
  });

  app.post('/account/addresses/:id/default', members, async (c) => {
    const id = addressId(c);
    if (id === undefined || !(await setDefaultAddress(db, member(c).id, id))) return c.notFound();
    setFlash(c, { kind: 'success', message: 'Default address changed.' });
    return c.redirect('/account/addresses', 303);
  });

  app.post('/account/addresses/:id/delete', members, async (c) => {
    const id = addressId(c);
    if (id === undefined || !(await deleteAddress(db, member(c).id, id))) return c.notFound();
    setFlash(c, { kind: 'success', message: 'Address deleted.' });
    return c.redirect('/account/addresses', 303);
  });

  return app;
}
