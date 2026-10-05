// Who may see an order's confirmation: its member, an admin, or the browser that placed it
// (a signed, httpOnly cookie listing recent order numbers, so guests can come back to the page
// without an account). Unknown or foreign orders answer 404, so numbers can't be probed.
import type { Context } from 'hono';
import { generateCookie, getCookie } from 'hono/cookie';
import { sign, verify } from '../services/signing.js';
import { isHttps } from './security/request.js';
import { queueCookie } from './security/sessions.js';
import type { AppEnv } from './security/index.js';

export const ORDER_ACCESS_COOKIE = 'orders';
const KEEP = 5;
const MAX_AGE = 60 * 60 * 24 * 30;

function grants(c: Context<AppEnv>, secret: string): string[] {
  const raw = getCookie(c, ORDER_ACCESS_COOKIE) ?? '';
  return raw.split(',').flatMap((entry) => {
    const [number, signature] = entry.split('.');
    return number !== undefined && signature !== undefined && verify(secret, number, signature)
      ? [number]
      : [];
  });
}

/** Lets this browser see the order (called when the order is placed). */
export function grantOrderAccess(c: Context<AppEnv>, secret: string, number: string): void {
  const kept = [number, ...grants(c, secret).filter((n) => n !== number)].slice(0, KEEP);
  const value = kept.map((n) => `${n}.${sign(secret, n)}`).join(',');
  queueCookie(
    c,
    generateCookie(ORDER_ACCESS_COOKIE, value, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/order',
      secure: isHttps(c),
      maxAge: MAX_AGE,
    }),
  );
}

export function canSeeOrder(
  c: Context<AppEnv>,
  secret: string,
  order: { readonly number: string; readonly userId: number | null },
): boolean {
  const user = c.get('user');
  if (user !== undefined && (user.role === 'admin' || user.id === order.userId)) return true;
  return grants(c, secret).includes(order.number);
}
