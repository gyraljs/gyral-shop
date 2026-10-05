// Cart endpoints (docs/product-specs/cart.md). Two surfaces over the same services:
//   - POST forms under /cart/* for the no-JS path: Post/Redirect/Get to /cart with a flash.
//   - JSON under /api/cart for enhanced UI: CSRF in the x-csrf-token header; every response
//     carries the full cart view, so the client can reconcile optimistic updates.
// Mounted by app.ts. CSRF is enforced by the security middleware for every non-GET request.
import type { Context } from 'hono';
import { Hono } from 'hono';
import * as v from 'valibot';
import type { Db } from '../../db/client.js';
import {
  addToCart,
  applyPromoCode,
  cartErrorMessage,
  removeFromCart,
  removePromoCode,
  setCartQuantity,
  viewCart,
  type CartError,
  type CartOwner,
  type CartResult,
} from '../../services/cart.js';
import { setFlash } from '../flash.js';
import { ensureSession, type AppEnv } from '../security/index.js';
import { now } from '../security/runtime.js';

const Sku = v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(64));
const Code = v.pipe(v.string(), v.trim(), v.nonEmpty('Enter a promo code.'), v.maxLength(32));
/** Form fields arrive as strings; JSON may send numbers. Out-of-range values are clamped later. */
const Quantity = v.pipe(
  v.union([v.number(), v.pipe(v.string(), v.trim(), v.nonEmpty(), v.transform(Number))]),
  v.integer(),
  v.minValue(0),
  v.maxValue(999),
);

const AddInput = v.object({ sku: Sku, quantity: v.optional(Quantity, 1) });
const QuantityInput = v.object({ quantity: Quantity });
const SetInput = v.object({ sku: Sku, quantity: Quantity });
const SkuInput = v.object({ sku: Sku });
const PromoInput = v.object({ code: Code });

/** The cart owner for this request. Write routes always have a session (CSRF requires one). */
async function ownerFor(c: Context<AppEnv>, create: boolean): Promise<CartOwner | undefined> {
  const user = c.get('user');
  if (user !== undefined) return { kind: 'member', userId: user.id };
  const session = create ? await ensureSession(c) : c.get('session');
  return session === undefined ? undefined : { kind: 'guest', sessionId: session.id };
}

const STATUS: Record<CartError['_tag'], 404 | 409 | 422> = {
  UnknownSku: 404,
  NotInCart: 404,
  OutOfStock: 409,
  PromoRejected: 422,
};

async function formBody(c: Context): Promise<Record<string, unknown>> {
  const form = await c.req.formData();
  return Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === 'string'));
}

async function jsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

export function cartRoutes(db: Db): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  // --- No-JS forms: always redirect back to the cart with a flash message. ---------------
  const redirectWith = (c: Context, result: CartResult) => {
    setFlash(
      c,
      result.ok
        ? { kind: 'success', message: result.value.message }
        : { kind: 'error', message: cartErrorMessage(result.error) },
    );
    return c.redirect('/cart', 303);
  };
  const invalidForm = (c: Context, message: string) => {
    setFlash(c, { kind: 'error', message });
    return c.redirect('/cart', 303);
  };

  const form = <S extends v.GenericSchema>(
    path: string,
    schema: S,
    action: (owner: CartOwner, input: v.InferOutput<S>, c: Context<AppEnv>) => Promise<CartResult>,
    invalid = 'Please check the item and quantity.',
  ) =>
    routes.post(path, async (c) => {
      const parsed = v.safeParse(schema, await formBody(c));
      if (!parsed.success) return invalidForm(c, parsed.issues[0].message);
      const owner = await ownerFor(c, true);
      if (owner === undefined) return invalidForm(c, invalid);
      return redirectWith(c, await action(owner, parsed.output, c));
    });

  form('/cart/add', AddInput, (owner, i) => addToCart(db, owner, i.sku, i.quantity));
  form('/cart/update', SetInput, (owner, i) => setCartQuantity(db, owner, i.sku, i.quantity));
  form('/cart/remove', SkuInput, (owner, i) => removeFromCart(db, owner, i.sku));
  form('/cart/promo', PromoInput, (owner, i, c) => applyPromoCode(db, owner, i.code, now(c)));
  form('/cart/promo/remove', v.object({}), (owner) => removePromoCode(db, owner));

  // --- JSON API: the same operations; every answer includes the full cart view. ----------
  const reply = async (c: Context<AppEnv>, result: CartResult | undefined) => {
    const cart = await viewCart(db, await ownerFor(c, false), now(c));
    if (result === undefined) return c.json({ cart });
    if (result.ok) return c.json({ cart, notice: result.value.message });
    const error = { _tag: result.error._tag, message: cartErrorMessage(result.error) };
    return c.json({ cart, error }, STATUS[result.error._tag]);
  };
  const badInput = (c: Context, issues: readonly v.BaseIssue<unknown>[]) =>
    c.json(
      {
        error: {
          _tag: 'InvalidInput',
          message: issues[0]?.message ?? 'Invalid request.',
          issues: issues.map((i) => ({ path: v.getDotPath(i), message: i.message })),
        },
      },
      400,
    );

  const api = <S extends v.GenericSchema>(
    method: 'post' | 'patch' | 'delete',
    path: string,
    schema: S,
    action: (owner: CartOwner, input: v.InferOutput<S>, c: Context<AppEnv>) => Promise<CartResult>,
  ) =>
    routes[method](path, async (c) => {
      const body = method === 'delete' ? {} : await jsonBody(c);
      const parsed = v.safeParse(schema, { ...(body as object), ...c.req.param() });
      if (!parsed.success) return badInput(c, parsed.issues);
      const owner = await ownerFor(c, true);
      return reply(c, owner === undefined ? undefined : await action(owner, parsed.output, c));
    });

  routes.get('/api/cart', async (c) => reply(c, undefined));
  api('post', '/api/cart/items', AddInput, (owner, i) => addToCart(db, owner, i.sku, i.quantity));
  api('patch', '/api/cart/items/:sku', v.object({ ...QuantityInput.entries, sku: Sku }), (o, i) =>
    setCartQuantity(db, o, i.sku, i.quantity),
  );
  api('delete', '/api/cart/items/:sku', SkuInput, (o, i) => removeFromCart(db, o, i.sku));
  api('post', '/api/cart/promo', PromoInput, (o, i, c) => applyPromoCode(db, o, i.code, now(c)));
  api('delete', '/api/cart/promo', v.object({}), (o) => removePromoCode(db, o));

  return routes;
}
