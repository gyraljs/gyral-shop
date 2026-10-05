// One-shot messages carried across a Post/Redirect/Get (no-JS forms). A short-lived cookie,
// read and cleared by the next page that renders it (e.g. the cart page). Hono URL-encodes
// cookie values, so the JSON is stored as is.
import type { Context } from 'hono';
import { generateCookie, getCookie, setCookie } from 'hono/cookie';
import * as v from 'valibot';
import { isHttps } from './security/request.js';
import { queueCookie } from './security/sessions.js';

export const FLASH_COOKIE = 'flash';

const Flash = v.object({
  kind: v.picklist(['success', 'error']),
  message: v.pipe(v.string(), v.maxLength(500)),
});
export type Flash = v.InferOutput<typeof Flash>;

export function setFlash(c: Context, flash: Flash): void {
  setCookie(c, FLASH_COOKIE, JSON.stringify(flash), {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: isHttps(c),
    maxAge: 60,
  });
}

/** The pending flash message, if any; clears it so it shows once. */
export function takeFlash(c: Context): Flash | undefined {
  const raw = getCookie(c, FLASH_COOKIE);
  if (raw === undefined) return undefined;
  // Queued, not deleteCookie(c, …): pages return their own Response, which would drop it.
  queueCookie(c, generateCookie(FLASH_COOKIE, '', { path: '/', maxAge: 0 }));
  try {
    const parsed = v.safeParse(Flash, JSON.parse(raw));
    return parsed.success ? parsed.output : undefined;
  } catch {
    return undefined;
  }
}
