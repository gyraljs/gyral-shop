// Theme stylesheets and the theme choice (ADR 0006 rule 8).
//   GET  /themes/<name>.<hash>.css  one theme, cached for a year (the hash changes with the CSS)
//   GET  /themes/current.css        the visitor's theme, for prerendered pages (Vary: Cookie)
//   GET  /theme                     a page with the switcher (no-JS error re-render target)
//   POST /theme                     saves the choice; origin-verified like /consent, so choosing
//                                   a theme never starts a session (ADR 0002 addendum)
import { Hono, type Context } from 'hono';
import { formAction, rejectWith, seeOther } from '@gyral/ssr';
import { html, type IntentRejected } from '@gyral/core';
import { findTheme } from '../../ui/themes/registry.js';
import { ThemeForm } from '../../ui/theme/switcher.js';
import type { RenderPage } from '../document.js';
import { safeNext, type AppEnv } from '../security/index.js';
import { CURRENT_THEME_PATH, readTheme, setTheme, themeHash, themeOptions } from '../theme.js';

const CSS = 'text/css; charset=utf-8';
const HASHED = /^([a-z0-9-]{1,40})\.([A-Za-z0-9_-]{10})\.css$/;

export interface ThemeRouteOptions {
  readonly render: RenderPage;
}

export function themeRoutes({ render }: ThemeRouteOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get(CURRENT_THEME_PATH, (c) => {
    const theme = readTheme(c);
    const etag = `"${theme.name}-${themeHash(theme)}"`;
    const headers = { 'cache-control': 'private, no-cache', vary: 'Cookie', etag };
    if (c.req.header('if-none-match') === etag) return c.body(null, 304, headers);
    return c.body(theme.css, 200, { ...headers, 'content-type': CSS });
  });

  app.get('/themes/:file', (c) => {
    const [, name, hash] = HASHED.exec(c.req.param('file')) ?? [];
    const theme = findTheme(name);
    if (theme === undefined || hash !== themeHash(theme)) return c.notFound();
    return c.body(theme.css, 200, {
      'content-type': CSS,
      'cache-control': 'public, max-age=31536000, immutable',
    });
  });

  const settings = async (c: Context<AppEnv>, status = 200, rejected?: IntentRejected) => {
    const response = await render({
      title: 'Theme',
      noindex: true,
      status,
      main: html`<h1>Theme</h1>
        <p>Choose how the store looks. Your choice is saved in a cookie on this browser.</p>
        <shop-theme-switcher
          .themes=${themeOptions()}
          current=${readTheme(c).name}
          return-to="/theme"
          .initialMessages=${rejected === undefined ? [] : [rejected]}
        ></shop-theme-switcher>`,
    });
    response.headers.set('cache-control', 'no-store');
    return response;
  };

  app.get('/theme', (c) => settings(c));

  app.post('/theme', async (c) =>
    formAction(ThemeForm, {
      intent: 'Choose',
      valid: (data) => {
        const theme = findTheme(data.theme);
        if (theme === undefined) {
          return rejectWith([{ path: 'theme', message: 'Choose one of the listed themes.' }]);
        }
        setTheme(c, theme);
        return seeOther(safeNext(data.return));
      },
      invalid: (rejected) => settings(c, 422, rejected),
    })(c.req.raw),
  );

  return app;
}
