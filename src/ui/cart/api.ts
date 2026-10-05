// The cart JSON API as a Gyral driver (effects as data, Gyral ADR 0006). Requests are plain
// data built by the cart store; this driver performs them. Tests substitute it by name.
//
// Not @gyral/http: its HttpStatusError drops the response body, but the cart API answers
// 404/409/422 with the full cart plus an error, and the UI needs both (gyral-ud5.7).
import { defineDriver } from '@gyral/core';
import * as v from 'valibot';
import { CSRF_HEADER, readCsrfToken } from '../forms/csrf.js';
import { ApiAnswerSchema, type ApiAnswer } from './model.js';

export type CartRequest =
  | { readonly _tag: 'Get' }
  | { readonly _tag: 'Add'; readonly sku: string; readonly quantity: number }
  | { readonly _tag: 'SetQuantity'; readonly sku: string; readonly quantity: number }
  | { readonly _tag: 'Remove'; readonly sku: string }
  | { readonly _tag: 'ApplyPromo'; readonly code: string }
  | { readonly _tag: 'RemovePromo' };

export const CART_API = 'cart-api';

interface Http {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly body?: unknown;
}

/** Where each request goes (src/server/routes/cart-api.ts). */
export function toHttp(request: CartRequest): Http {
  const item = (sku: string) => `/api/cart/items/${encodeURIComponent(sku)}`;
  switch (request._tag) {
    case 'Get':
      return { method: 'GET', path: '/api/cart' };
    case 'Add':
      return {
        method: 'POST',
        path: '/api/cart/items',
        body: { sku: request.sku, quantity: request.quantity },
      };
    case 'SetQuantity':
      return { method: 'PATCH', path: item(request.sku), body: { quantity: request.quantity } };
    case 'Remove':
      return { method: 'DELETE', path: item(request.sku) };
    case 'ApplyPromo':
      return { method: 'POST', path: '/api/cart/promo', body: { code: request.code } };
    case 'RemovePromo':
      return { method: 'DELETE', path: '/api/cart/promo' };
  }
}

/** Thrown for answers that aren't the API's JSON (network errors reject fetch itself). */
export class CartApiError extends Error {
  override readonly name = 'CartApiError';
}

/**
 * Every status carries a JSON answer: 2xx with the cart, 4xx with the cart (when there is one)
 * and an error. Anything else is a failure the store reports and recovers from.
 */
export const cartApi = defineDriver<CartRequest, ApiAnswer, CartApiError>({
  name: CART_API,
  concurrency: 'queue',
  toError: (cause) =>
    cause instanceof CartApiError ? cause : new CartApiError('The cart could not be updated.'),
  run: async (request, { signal }) => {
    const { method, path, body } = toHttp(request);
    const token = readCsrfToken();
    const response = await fetch(path, {
      method,
      signal,
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token === undefined ? {} : { [CSRF_HEADER]: token }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const parsed = v.safeParse(ApiAnswerSchema, await response.json().catch(() => undefined));
    if (!parsed.success || (response.status >= 500 && parsed.output.error === undefined)) {
      throw new CartApiError(`Unexpected cart answer (${String(response.status)}).`);
    }
    return parsed.output;
  },
});
