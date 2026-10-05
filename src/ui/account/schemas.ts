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

/** Fields never echoed back into a page (state is serialized into the HTML). */
export const SECRET_FIELDS: ReadonlySet<string> = new Set(['password', 'confirm', '_csrf']);
