// CSRF token plumbing shared by server-rendered forms and browser fetches
// (docs/design-docs/0002-security.md). The server checks either the form field or the header.
import { html } from '@gyral/core';

/** Hidden form field name carrying the session's CSRF token. */
export const CSRF_FIELD = '_csrf';
/** Request header carrying the token for fetch/http-driver requests. */
export const CSRF_HEADER = 'x-csrf-token';
/** `<meta name>` the document shell uses to hand the token to browser code. */
export const CSRF_META = 'csrf-token';

/** Put inside every state-changing `<form method="post">`. */
export const csrfField = (token: string) =>
  html`<input type="hidden" name=${CSRF_FIELD} value=${token} />`;

/** Browser side: the current page's token, for `x-csrf-token` on fetches. */
export function readCsrfToken(doc: Document = document): string | undefined {
  return doc.querySelector(`meta[name="${CSRF_META}"]`)?.getAttribute('content') ?? undefined;
}
