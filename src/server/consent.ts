// The consent cookie (docs/product-specs/consent.md). Not HttpOnly-sensitive data, but the
// browser never needs to read it: the server renders the banner (or not) from it.
import type { Context } from 'hono';
import { generateCookie, getCookie } from 'hono/cookie';
import { tryGetContext } from 'hono/context-storage';
import { parseConsent, serializeConsent, type Consent } from '../domain/consent.js';
import { isHttps } from './security/request.js';
import { queueCookie, type AppEnv } from './security/index.js';

export const CONSENT_COOKIE = 'consent';
const SIX_MONTHS = 60 * 60 * 24 * 182;

export const readConsent = (c: Context): Consent | undefined =>
  parseConsent(getCookie(c, CONSENT_COOKIE));

/** The current request's consent, for the document shell (undefined: undecided or no request). */
export function currentConsent(): { readonly decided: boolean; readonly consent?: Consent } {
  const c = tryGetContext<AppEnv>();
  if (c === undefined) return { decided: true }; // no request (tests rendering a shell): no banner
  const consent = readConsent(c);
  return consent === undefined ? { decided: false } : { decided: true, consent };
}

/** The path and query of the current request, for "return to this page" after a choice. */
export function currentPath(): string {
  const c = tryGetContext<AppEnv>();
  if (c === undefined) return '/';
  const url = new URL(c.req.url);
  return `${url.pathname}${url.search}`;
}

/** Queued, like every cookie here: routes return their own Response. */
export function setConsent(c: Context, consent: Consent): void {
  queueCookie(
    c,
    generateCookie(CONSENT_COOKIE, serializeConsent(consent), {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      secure: isHttps(c),
      maxAge: SIX_MONTHS,
    }),
  );
}
