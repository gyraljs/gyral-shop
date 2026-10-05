// The wishlist JSON API as a Gyral driver (effects as data, Gyral ADR 0006). The store builds
// requests; this performs them. Tests substitute it by name.
import { defineDriver } from '@gyral/core';
import { csrfFromMeta } from '@gyral/http';
import * as v from 'valibot';
import { CSRF_HEADER, CSRF_META } from '../forms/csrf.js';

export type WishlistRequest =
  | { readonly _tag: 'Save'; readonly slug: string }
  | { readonly _tag: 'Remove'; readonly slug: string };

export const WishlistAnswerSchema = v.object({
  slugs: v.array(v.string()),
  message: v.optional(v.string()),
  error: v.optional(v.string()),
});
export type WishlistAnswer = v.InferOutput<typeof WishlistAnswerSchema>;

export const WISHLIST_API = 'wishlist-api';

const csrfHeaders = csrfFromMeta(CSRF_META, CSRF_HEADER);

export class WishlistApiError extends Error {
  override readonly name = 'WishlistApiError';
}

/** Where each request goes (src/server/routes/wishlist.ts). */
export const toHttp = (r: WishlistRequest) =>
  r._tag === 'Save'
    ? { method: 'POST', path: '/api/wishlist/items', body: JSON.stringify({ product: r.slug }) }
    : {
        method: 'DELETE',
        path: `/api/wishlist/items/${encodeURIComponent(r.slug)}`,
        body: undefined,
      };

export const wishlistApi = defineDriver<WishlistRequest, WishlistAnswer, WishlistApiError>({
  name: WISHLIST_API,
  concurrency: 'queue',
  toError: (cause) =>
    cause instanceof WishlistApiError ? cause : new WishlistApiError('Wishlist not updated.'),
  run: async (request, { signal }) => {
    const { method, path, body } = toHttp(request);
    const response = await fetch(path, {
      method,
      signal,
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...csrfHeaders(),
      },
      ...(body === undefined ? {} : { body }),
    });
    const parsed = v.safeParse(WishlistAnswerSchema, await response.json().catch(() => undefined));
    if (!parsed.success || !response.ok) {
      throw new WishlistApiError(
        parsed.success && parsed.output.error !== undefined
          ? parsed.output.error
          : `Unexpected wishlist answer (${String(response.status)}).`,
      );
    }
    return parsed.output;
  },
});
