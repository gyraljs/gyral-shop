// The theme cookie and theme stylesheet URLs (ADR 0006 rule 8).
//
// Server-rendered pages link the visitor's theme by a content-hashed URL (cached for a year).
// Prerendered pages are the same HTML for everyone, so they link `/themes/current.css`, which
// the server answers from the visitor's cookie (revalidated, Vary: Cookie): the right theme
// with no script and no flash.
import { createHash } from 'node:crypto';
import type { Context } from 'hono';
import { generateCookie, getCookie } from 'hono/cookie';
import { tryGetContext } from 'hono/context-storage';
import { DEFAULT_THEME, findTheme, THEMES } from '../ui/themes/registry.js';
import type { ThemeDefinition } from '../ui/themes/theme.js';
import { isHttps } from './security/request.js';
import { queueCookie, type AppEnv } from './security/index.js';

export const THEME_COOKIE = 'theme';
export const CURRENT_THEME_PATH = '/themes/current.css';
const ONE_YEAR = 60 * 60 * 24 * 365;

/** A stable fingerprint of the stylesheet: the URL changes whenever the CSS does. */
const hashes = new Map(
  THEMES.map((t) => [t.name, createHash('sha256').update(t.css).digest('base64url').slice(0, 10)]),
);

export const themeHash = (theme: ThemeDefinition): string => hashes.get(theme.name) ?? '';

export const themeHref = (theme: ThemeDefinition): string =>
  `/themes/${theme.name}.${themeHash(theme)}.css`;

/** The visitor's theme: the cookie when it names a shipped theme, otherwise the default. */
export function readTheme(c: Context): ThemeDefinition {
  return findTheme(getCookie(c, THEME_COOKIE)) ?? findTheme(DEFAULT_THEME) ?? defaultOrThrow();
}

function defaultOrThrow(): never {
  throw new Error(`The default theme "${DEFAULT_THEME}" is not registered`);
}

/** The current request's theme, for the document shell (the default outside a request). */
export function currentTheme(): ThemeDefinition {
  const c = tryGetContext<AppEnv>();
  return c === undefined ? (findTheme(DEFAULT_THEME) ?? defaultOrThrow()) : readTheme(c);
}

/** Queued, like every cookie here: routes return their own Response. Not sensitive. */
export function setTheme(c: Context, theme: ThemeDefinition): void {
  queueCookie(
    c,
    generateCookie(THEME_COOKIE, theme.name, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      secure: isHttps(c),
      maxAge: ONE_YEAR,
    }),
  );
}

/** What the switcher needs per theme (no CSS: the client never downloads unused themes). */
export interface ThemeOption {
  readonly name: string;
  readonly label: string;
  readonly href: string;
}

export const themeOptions = (): readonly ThemeOption[] =>
  THEMES.map((t) => ({ name: t.name, label: t.label, href: themeHref(t) }));
