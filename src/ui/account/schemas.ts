// One schema per form, used by the browser's form() intent and the server's handlers alike
// (Gyral ADR 0008), so both paths reject identically. Native constraints in the markup catch
// the easy cases first.
import { defineForm } from '@gyral/core';
import * as v from 'valibot';
import { MAX_NAME_LENGTH, passwordProblem } from '../../domain/accounts.js';

const email = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.nonEmpty('Enter your email address.'),
  v.email('Enter a valid email address.'),
);

/** `?next=` travels in a hidden field; the server checks it with safeNext(). */
const next = v.optional(v.string(), '');

export const LoginForm = defineForm(
  v.object({
    email,
    password: v.pipe(v.string(), v.nonEmpty('Enter your password.')),
    next,
  }),
);

export const RegisterForm = defineForm(
  v.pipe(
    v.object({
      name: v.pipe(
        v.string(),
        v.trim(),
        v.nonEmpty('Enter your name.'),
        v.maxLength(MAX_NAME_LENGTH, `Use at most ${String(MAX_NAME_LENGTH)} characters.`),
      ),
      email,
      password: v.pipe(
        v.string(),
        v.check(
          (password) => passwordProblem(password) === undefined,
          (issue) => passwordProblem(issue.input) ?? 'Choose another password.',
        ),
      ),
      confirm: v.string(),
      next,
    }),
    v.forward(
      v.partialCheck(
        [['password'], ['confirm']],
        (input) => input.password === input.confirm,
        'The passwords do not match.',
      ),
      ['confirm'],
    ),
  ),
);

/**
 * What the server answers a JavaScript submission with: where to go next, or the same
 * `IntentRejected` the no-JS path renders. Always 200, because @gyral/http drops the body of
 * error statuses (a Gyral bead tracks that).
 */
export const AuthOutcome = v.variant('_tag', [
  v.object({ _tag: v.literal('SignedIn'), location: v.string() }),
  v.object({
    _tag: v.literal('IntentRejected'),
    intent: v.string(),
    issues: v.array(v.object({ path: v.string(), message: v.string() })),
    values: v.optional(v.record(v.string(), v.union([v.string(), v.array(v.string())]))),
  }),
]);

export type AuthOutcome = v.InferOutput<typeof AuthOutcome>;

/** Fields never echoed back into a page (state is serialized into the HTML). */
export const SECRET_FIELDS: ReadonlySet<string> = new Set(['password', 'confirm', '_csrf']);
