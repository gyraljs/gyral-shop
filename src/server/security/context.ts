// What security middleware puts on every request (Hono variables). Routes read it with
// c.get('session') / c.get('user'), or the helpers in ./index.ts.
import type { Session, SessionUser } from '../../services/sessions.js';

export interface SecurityVariables {
  /** The live session, if the visitor has one. Created on demand by ensureSession(). */
  session: Session | undefined;
  /** The signed-in member, if any. */
  user: SessionUser | undefined;
}

export interface AppEnv {
  Variables: SecurityVariables;
}
