// Shared answers for the admin JSON API.
import type { Context } from 'hono';
import type { IntentRejected } from '@gyral/core';
import { rejectWith, type FormReject } from '@gyral/ssr';
import type { Result } from '../../domain/result.js';
import type { AdminError } from '../../services/admin-products.js';
import type { AppEnv } from '../security/index.js';

type C = Context<AppEnv>;

/** API answers are per-user and change constantly: never cache them. */
export const NO_STORE = { 'cache-control': 'no-store' } as const;

/** 403 for an authenticated non-admin (the route guard normally stops them first). */
export const forbidden = (c: C) => c.json({ error: 'forbidden' }, 403, NO_STORE);

/** An admin service failure as an HTTP answer. */
export function adminFailure(c: C, error: AdminError): Response {
  switch (error._tag) {
    case 'Unauthenticated':
      return c.json({ error: 'unauthenticated' }, 401, NO_STORE);
    case 'Forbidden':
      return c.json({ error: 'forbidden' }, 403, NO_STORE);
    case 'NotFound':
      return c.json({ error: 'not-found' }, 404, NO_STORE);
    case 'Invalid':
      return c.json({ error: 'invalid', issues: error.issues }, 422, NO_STORE);
  }
}

/** A service result for a formAction: success JSON, a field rejection, or an error answer. */
export function answer<T>(
  c: C,
  result: Result<T, AdminError>,
  body: (value: T) => object,
): Response | FormReject {
  if (result.ok) return c.json(body(result.value), 200, NO_STORE);
  return result.error._tag === 'Invalid'
    ? rejectWith(result.error.issues)
    : adminFailure(c, result.error);
}

/** The admin requires JavaScript, so a rejected submission is always answered as JSON. */
export const asJson = (rejected: IntentRejected) =>
  Response.json(
    { _tag: rejected._tag, intent: rejected.intent, issues: rejected.issues },
    { status: 422, headers: NO_STORE },
  );

/** A positive integer id from a route parameter, or undefined. */
export const positiveId = (text: string): number | undefined => {
  const n = Number(text);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
};

/** `?page=` as a positive integer (1 when missing or malformed). */
export const pageParam = (text: string | undefined): number => positiveId(text ?? '1') ?? 1;
