// Settings the security middleware shares with route helpers, stored per request.
import type { Context } from 'hono';
import type { Db } from '../../db/client.js';
import type { SecurityRejection } from '../../ui/pages/security-errors.js';

export interface SecurityOptions {
  readonly db: Db;
  /** Development: allows the Vite HMR websocket in the CSP. */
  readonly dev?: boolean;
  /** Clock, for tests. */
  readonly now?: () => Date;
  /** Trust `x-forwarded-for`/`x-forwarded-proto` (only behind a known proxy). */
  readonly trustProxy?: boolean;
  /** Renders the HTML page for a rejected request (the JSON variant is built-in). */
  readonly render: (
    c: Context,
    kind: SecurityRejection,
    status: 403 | 429,
    retryAfterSeconds: number,
  ) => Response | Promise<Response>;
}

const RUNTIME = new WeakMap<Request, SecurityOptions>();

/** Anything carrying the raw request (any Hono context, whatever its env type). */
interface HasRequest {
  readonly req: { readonly raw: Request };
}

export const attachRuntime = (c: HasRequest, options: SecurityOptions): void => {
  RUNTIME.set(c.req.raw, options);
};

export function runtime(c: HasRequest): SecurityOptions {
  const options = RUNTIME.get(c.req.raw);
  if (options === undefined) {
    throw new Error('Security middleware is not installed: call installSecurity(app, …) first.');
  }
  return options;
}

export const now = (c: HasRequest): Date => (runtime(c).now ?? (() => new Date()))();
