// Wishlist routes (docs/product-specs/wishlist-reviews.md). Members only, except the guest
// "sign in to save" hop, which remembers the product in a cookie that signing in consumes
// (security/sessions.ts). Every form post is Post/Redirect/Get with a flash message; the JSON
// API answers the wishlist store with the saved slugs.
import { Hono, type Context } from 'hono';
import { generateCookie } from 'hono/cookie';
import * as v from 'valibot';
import type { Db } from '../../db/client.js';
import {
  moveToCart,
  removeFromWishlist,
  saveToWishlist,
  wishlistCards,
  wishlistErrorMessage,
  wishlistSlugs,
  type WishlistError,
  type WishlistNotice,
} from '../../services/wishlist.js';
import type { Result } from '../../domain/result.js';
import { WISHLIST_PATH, wishlistPage } from '../../ui/pages/wishlist.js';
import type { RenderPage } from '../document.js';
import { setFlash, takeFlash } from '../flash.js';
import {
  csrfTokenFor,
  isHttps,
  loginRedirect,
  queueCookie,
  requireUser,
  safeNext,
  wantsJson,
  WISHLIST_SAVE_COOKIE,
  type AppEnv,
} from '../security/index.js';
import { CARD_CHUNKS } from '../route-chunks.js';

export interface WishlistRouteOptions {
  readonly db: Db;
  readonly render: RenderPage;
}

type C = Context<AppEnv>;

const Slug = v.pipe(v.string(), v.trim(), v.regex(/^[a-z0-9][a-z0-9-]{0,199}$/));
const ItemForm = v.object({ product: Slug, next: v.optional(v.string()) });

const member = (c: C) => {
  const user = c.get('user');
  if (user === undefined) throw new Error('wishlist: requireUser() did not run');
  return user;
};

/** The same-site path the request came from, if any (no-JS posts from listings). */
function refererPath(c: C): string | undefined {
  const referer = c.req.header('referer');
  if (referer === undefined) return undefined;
  try {
    const url = new URL(referer);
    return url.origin === new URL(c.req.url).origin ? url.pathname + url.search : undefined;
  } catch {
    return undefined;
  }
}

const statusOf = (e: WishlistError) =>
  e._tag === 'UnknownProduct' ? 404 : e._tag === 'Full' ? 409 : 422;

export function wishlistRoutes({ db, render }: WishlistRouteOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const members = requireUser();

  app.get(WISHLIST_PATH, members, async (c) => {
    const flash = takeFlash(c);
    const response = await render({
      title: 'Wishlist',
      noindex: true,
      chunks: CARD_CHUNKS,
      main: wishlistPage({
        csrfToken: await csrfTokenFor(c),
        items: await wishlistCards(db, member(c).id),
        ...(flash === undefined ? {} : { flash }),
      }),
    });
    response.headers.set('cache-control', 'no-store');
    return response;
  });

  /** Answers a form post (PRG + flash) or a JSON caller (the saved slugs). */
  const respond = async (
    c: C,
    slug: string,
    next: string,
    result: Result<WishlistNotice, WishlistError>,
  ) => {
    if (wantsJson(c)) {
      const slugs = await wishlistSlugs(db, member(c).id);
      return result.ok
        ? c.json({ slugs, message: result.value.message })
        : c.json({ slugs, error: wishlistErrorMessage(result.error) }, statusOf(result.error));
    }
    if (result.ok) {
      setFlash(c, { kind: 'success', message: result.value.message });
      return c.redirect(next, 303);
    }
    setFlash(c, { kind: 'error', message: wishlistErrorMessage(result.error) });
    // Products with options are chosen on their own page.
    return c.redirect(result.error._tag === 'ChooseOptions' ? `/p/${slug}` : next, 303);
  };

  const formPost =
    (run: (userId: number, slug: string) => Promise<Result<WishlistNotice, WishlistError>>) =>
    async (c: C) => {
      const body = Object.fromEntries((await c.req.formData()).entries());
      const parsed = v.safeParse(ItemForm, body);
      if (!parsed.success) return c.text('Bad request', 400);
      const { product, next } = parsed.output;
      const target = safeNext(next ?? refererPath(c) ?? `/p/${product}`);
      return respond(c, product, target, await run(member(c).id, product));
    };

  app.post(
    '/wishlist/add',
    members,
    formPost((id, slug) => saveToWishlist(db, id, slug)),
  );
  app.post(
    '/wishlist/remove',
    members,
    formPost((id, slug) => removeFromWishlist(db, id, slug)),
  );
  app.post(
    '/wishlist/move',
    members,
    formPost((id, slug) => moveToCart(db, id, slug)),
  );

  // Guests: remember the product, then sign in; signing in saves it (security/sessions.ts).
  app.get('/wishlist/sign-in', (c) => {
    const back = safeNext(c.req.query('next'));
    if (c.get('user') !== undefined) return c.redirect(back, 303);
    const slug = v.safeParse(Slug, c.req.query('product') ?? '');
    if (slug.success) {
      queueCookie(
        c,
        generateCookie(WISHLIST_SAVE_COOKIE, slug.output, {
          httpOnly: true,
          sameSite: 'Lax',
          path: '/',
          secure: isHttps(c),
          maxAge: 30 * 60,
        }),
      );
    }
    return c.redirect(loginRedirect(back), 303);
  });

  // JSON API for the wishlist store (x-csrf-token header).
  app.post('/api/wishlist/items', members, async (c) => {
    const parsed = v.safeParse(
      v.object({ product: Slug }),
      await c.req.json().catch(() => undefined),
    );
    if (!parsed.success) return c.json({ error: 'Choose a product.' }, 400);
    const { product } = parsed.output;
    return respond(c, product, '/', await saveToWishlist(db, member(c).id, product));
  });

  app.delete('/api/wishlist/items/:slug', members, async (c) => {
    const parsed = v.safeParse(Slug, c.req.param('slug'));
    if (!parsed.success) return c.json({ error: 'Choose a product.' }, 400);
    return respond(
      c,
      parsed.output,
      '/',
      await removeFromWishlist(db, member(c).id, parsed.output),
    );
  });

  return app;
}
