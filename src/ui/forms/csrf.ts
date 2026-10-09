// CSRF token plumbing shared by server-rendered forms and browser fetches
// (docs/design-docs/0002-security.md). The server checks either the form field or the header.
import { html } from '@gyral/core';

/** Hidden form field name carrying the session's CSRF token. */
export const CSRF_FIELD = '_csrf';
/**
 * For a form definition's `secret` list: the CSRF field is posted with every form but is part of
 * no schema, and Gyral types `secret` by the schema's fields, hence the cast. Listed, the token
 * stays out of rejected values and so out of the state serialized into the page.
 */
export const CSRF_SECRET = CSRF_FIELD as never;
/** Request header carrying the token for fetch/http-driver requests. */
export const CSRF_HEADER = 'x-csrf-token';
/** `<meta name>` the document shell uses to hand the token to browser code. */
export const CSRF_META = 'csrf-token';

/** Put inside every state-changing `<form method="post">`. */
export const csrfField = (token: string) =>
  html`<input type="hidden" name=${CSRF_FIELD} value=${token} />`;
