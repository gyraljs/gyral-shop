// The storefront's http driver for writes (checkout steps, review votes): every request carries
// the session's CSRF token from the page's <meta> (docs/design-docs/0002-security.md). Gyral's
// http driver takes the token only from its headers, so components that post declare this one
// (`spec.drivers`); tests can still substitute a fake by name.
import { csrfFromMeta, makeHttpDriver } from '@gyral/http';
import { CSRF_HEADER, CSRF_META } from '../forms/csrf.js';

export const csrfHttp = makeHttpDriver({ headers: csrfFromMeta(CSRF_META, CSRF_HEADER) });
