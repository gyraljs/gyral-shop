// The storefront's http driver for writes (checkout steps, review votes): every request carries
// the session's CSRF token from the page's <meta> (docs/design-docs/0002-security.md). Gyral's
// http driver takes the token only from its headers, so the client entry provides this one for
// the whole storefront page (src/client/entry.ts); tests substitute a fake by name.
import { csrfFromMeta, makeHttpDriver } from '@gyral/http';
import { CSRF_HEADER, CSRF_META } from '../forms/csrf.js';

export const csrfHttp = makeHttpDriver({ headers: csrfFromMeta(CSRF_META, CSRF_HEADER) });
