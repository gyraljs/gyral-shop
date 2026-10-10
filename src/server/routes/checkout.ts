// Checkout routes (docs/product-specs/checkout.md). GET renders the page with the open step;
// each step POSTs to its own route through Gyral's formAction: browser form posts get a 303
// back to /checkout (or a 422 re-render with the step's errors), submitForm gets JSON (the new
// view, or the 422 IntentRejected). Both paths share the step schemas with the browser.
import type { Context } from 'hono';
import { Hono } from 'hono';
import { html, type FormDefinition, type IntentRejected } from '@gyral/core';
import { formAction, rejectWith, seeOther } from '@gyral/ssr';
import type * as v from 'valibot';
import type { Db } from '../../db/client.js';
import { isCheckoutStep, type CheckoutStep } from '../../domain/checkout.js';
import type { StateCode } from '../../domain/tax.js';
import {
  loadCheckout,
  saveAddress,
  saveContact,
  savePayment,
  saveShipping,
  type CheckoutBlock,
  type CheckoutState,
  type Shopper,
  type StepRejection,
} from '../../services/checkout.js';
import type { Services } from '../../services/container.js';
import { placeErrorMessage, placeKey, placeOrder, type PlaceError } from '../../services/orders.js';
import type { Result } from '../../domain/result.js';
import '../../ui/checkout/checkout-page.js'; // registers <shop-checkout> for server rendering
import {
  AddressForm,
  ContactForm,
  PaymentForm,
  PlaceOrderForm,
  ShippingForm,
} from '../../ui/checkout/schemas.js';
import { toCheckoutClient } from '../checkout-view.js';
import type { RenderPage } from '../document.js';
import { setFlash, takeFlash } from '../flash.js';
import { grantOrderAccess } from '../order-access.js';
import { csrfTokenFor, type AppEnv } from '../security/index.js';
import { now } from '../security/runtime.js';
import { publicOrigin } from '../origin.js';

export interface CheckoutRoutesOptions {
  readonly db: Db;
  readonly render: RenderPage;
  readonly services: Services;
}

/** The request's shopper. Guests without a session have no cart, so no checkout either. */
function shopperOf(c: Context<AppEnv>): Shopper | undefined {
  const user = c.get('user');
  if (user !== undefined) {
    return {
      owner: { kind: 'member', userId: user.id },
      member: { id: user.id, email: user.email },
    };
  }
  const session = c.get('session');
  return session === undefined ? undefined : { owner: { kind: 'guest', sessionId: session.id } };
}

const BLOCK_MESSAGES: Readonly<Record<CheckoutBlock['_tag'], string>> = {
  EmptyCart: 'Your cart is empty. Add something before checking out.',
  CartHasIssues: 'Some items in your cart need attention before you can check out.',
};

/** Accept says JSON (submitForm): the answer is JSON, never a page. */
const jsonWanted = (request: Request): boolean => {
  const accept = request.headers.get('accept') ?? '';
  return accept.includes('application/json') && !accept.includes('text/html');
};

/** Where each place-order failure sends the customer, with its message as a flash. */
const PLACE_TARGET: Readonly<Record<PlaceError['_tag'], string>> = {
  CartBlocked: '/cart',
  OutOfStock: '/cart',
  NotReady: '/checkout',
  Stale: '/checkout?edit=review',
  TotalChanged: '/checkout?edit=review',
  PromoExhausted: '/checkout?edit=review',
  PaymentDeclined: '/checkout?edit=payment',
  PaymentRetry: '/checkout?edit=payment',
  PaymentFailed: '/checkout?edit=payment',
};

export function checkoutRoutes({ db, render, services }: CheckoutRoutesOptions): Hono<AppEnv> {
  const { payments, secret } = services;
  const routes = new Hono<AppEnv>();

  /** Loads the checkout, or answers with the way back to the cart. */
  async function load(
    c: Context<AppEnv>,
  ): Promise<{ readonly shopper: Shopper; readonly state: CheckoutState } | Response> {
    const shopper = shopperOf(c);
    const loaded =
      shopper === undefined
        ? ({ ok: false, error: { _tag: 'EmptyCart' } } as const)
        : await loadCheckout(db, shopper, now(c));
    if (shopper !== undefined && loaded.ok) return { shopper, state: loaded.value };
    const block = loaded.ok ? 'EmptyCart' : loaded.error._tag;
    if (jsonWanted(c.req.raw)) {
      return Response.json({ _tag: 'Redirected', location: '/cart' });
    }
    setFlash(c, { kind: 'error', message: BLOCK_MESSAGES[block] });
    return c.redirect('/cart', 303);
  }

  async function page(
    c: Context<AppEnv>,
    state: CheckoutState,
    options: {
      readonly edit?: CheckoutStep;
      readonly rejected?: IntentRejected;
      readonly status?: number;
    } = {},
  ): Promise<Response> {
    const csrf = await csrfTokenFor(c);
    const card = state.draft.card;
    const key = card === undefined ? undefined : placeKey(secret, state.cartId, card.paymentRef);
    const view = toCheckoutClient(state, options.edit, key);
    return render({
      title: 'Checkout',
      noindex: true,
      csrfToken: csrf,
      ...(options.status === undefined ? {} : { status: options.status }),
      main: html`<shop-checkout
        data-region="checkout"
        csrf=${csrf}
        .view=${view}
        .initialMessages=${options.rejected === undefined ? [] : [options.rejected]}
      ></shop-checkout>`,
    });
  }

  routes.get('/checkout', async (c) => {
    const loaded = await load(c);
    if (loaded instanceof Response) return loaded;
    const edit = c.req.query('edit') ?? '';
    // A failed place-order redirects here with its message: show it on the step it concerns.
    const flash = takeFlash(c);
    const rejected: IntentRejected | undefined =
      flash?.kind === 'error'
        ? {
            _tag: 'IntentRejected',
            intent: edit === 'payment' ? 'Payment' : 'PlaceOrder',
            issues: [{ path: '', message: flash.message }],
          }
        : undefined;
    return page(c, loaded.state, {
      ...(isCheckoutStep(edit) ? { edit } : {}),
      ...(rejected === undefined ? {} : { rejected }),
    });
  });

  /** One step: validate with the shared schema, save, then answer per path. */
  function step<Schema extends v.GenericSchema>(
    path: string,
    intent: string,
    stepName: CheckoutStep,
    definition: FormDefinition<Schema>,
    save: (
      data: v.InferOutput<Schema>,
      loaded: { readonly shopper: Shopper; readonly state: CheckoutState },
      c: Context<AppEnv>,
    ) => Promise<Result<undefined, StepRejection>>,
  ) {
    routes.post(path, async (c) => {
      const loaded = await load(c);
      if (loaded instanceof Response) return loaded;
      return formAction(definition, {
        intent,
        valid: async (data, request) => {
          const saved = await save(data, loaded, c);
          if (!saved.ok) return rejectWith(saved.error.issues);
          if (!jsonWanted(request)) return seeOther('/checkout');
          const fresh = await loadCheckout(db, loaded.shopper, now(c));
          const card = fresh.ok ? fresh.value.draft.card : undefined;
          return fresh.ok
            ? Response.json(
                toCheckoutClient(
                  fresh.value,
                  undefined,
                  card === undefined
                    ? undefined
                    : placeKey(secret, fresh.value.cartId, card.paymentRef),
                ),
              )
            : Response.json({ _tag: 'Redirected', location: '/cart' });
        },
        invalid: (rejected) => page(c, loaded.state, { edit: stepName, rejected, status: 422 }),
      })(c.req.raw);
    });
  }

  step('/checkout/contact', 'Contact', 'contact', ContactForm, (data, { state }, c) =>
    saveContact(db, state, data.email, now(c)),
  );

  step('/checkout/address', 'Address', 'address', AddressForm, (data, { state, shopper }, c) => {
    const savedId = Number(data.addressId);
    const choice =
      data.addressId !== 'new' && Number.isInteger(savedId)
        ? { savedId }
        : {
            address: {
              name: data.name,
              line1: data.line1,
              line2: data.line2,
              city: data.city,
              // The schema accepted it only if it is a state code.
              state: data.state as StateCode,
              postalCode: data.postalCode,
              phone: data.phone,
            },
          };
    return saveAddress(db, state, shopper, { choice, save: data.save === 'on' }, now(c));
  });

  step('/checkout/shipping', 'Shipping', 'shipping', ShippingForm, (data, { state }, c) =>
    saveShipping(db, state, data.method, now(c)),
  );

  step('/checkout/payment', 'Payment', 'payment', PaymentForm, (data, { state }, c) =>
    savePayment(db, state, data, payments, now(c)),
  );

  // Place order: Post/Redirect/Get on both paths. Success → the confirmation page; a failure
  // → the step it concerns (or the cart) with a flash message. Only schema errors (terms) are
  // a 422 re-render. The cart may already be gone on a repeated submit, so no load() first.
  routes.post('/checkout/place', async (c) => {
    const shopper = shopperOf(c);
    return formAction(PlaceOrderForm, {
      intent: 'PlaceOrder',
      valid: async (data) => {
        if (shopper === undefined) return seeOther('/cart');
        const placed = await placeOrder(services, shopper, {
          key: data.key,
          ...(data.expectedTotal === undefined ? {} : { expectedTotalCents: data.expectedTotal }),
          origin: publicOrigin(c),
        });
        if (!placed.ok) {
          setFlash(c, { kind: 'error', message: placeErrorMessage(placed.error) });
          return seeOther(PLACE_TARGET[placed.error._tag]);
        }
        grantOrderAccess(c, secret, placed.value.number);
        return seeOther(`/order/${placed.value.number}/confirmation`);
      },
      invalid: async (rejected) => {
        const loaded = await load(c);
        if (loaded instanceof Response) return loaded;
        return page(c, loaded.state, { edit: 'review', rejected, status: 422 });
      },
    })(c.req.raw);
  });

  return routes;
}
