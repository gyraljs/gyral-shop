// The contact form (docs/product-specs/content.md): one schema for the browser's form() and
// the server's formAction(), a light-DOM member form, mail goes to the outbox.
import { defineForm } from '@gyral/core';
import * as v from 'valibot';
import { email } from '../account/settings-schemas.js';
import { defineMemberForm } from '../forms/member-form.js';

export const CONTACT_TOPICS = [
  { value: 'order', label: 'An order' },
  { value: 'product', label: 'A product' },
  { value: 'account', label: 'My account' },
  { value: 'other', label: 'Something else' },
] as const;

export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;

export const ContactForm = defineForm(
  v.object({
    name: v.pipe(v.string(), v.trim(), v.nonEmpty('Enter your name.'), v.maxLength(80)),
    email,
    topic: v.picklist(
      CONTACT_TOPICS.map((t) => t.value),
      'Choose a topic.',
    ),
    message: v.pipe(
      v.string(),
      v.trim(),
      v.minLength(MESSAGE_MIN, `Write at least ${String(MESSAGE_MIN)} characters.`),
      v.maxLength(MESSAGE_MAX, `Keep it under ${String(MESSAGE_MAX)} characters.`),
    ),
  }),
);

export const topicLabel = (value: string): string =>
  CONTACT_TOPICS.find((t) => t.value === value)?.label ?? value;

export const ContactFormElement = defineMemberForm({
  tag: 'shop-contact-form',
  action: '/contact',
  form: ContactForm,
  fields: [
    { kind: 'text', name: 'name', label: 'Your name', autocomplete: 'name', maxlength: 80 },
    { kind: 'email', name: 'email', label: 'Email', autocomplete: 'email' },
    {
      kind: 'select',
      name: 'topic',
      label: 'Topic',
      options: CONTACT_TOPICS.map((t) => ({ value: t.value, label: t.label })),
    },
    { kind: 'textarea', name: 'message', label: 'Message', maxlength: MESSAGE_MAX, rows: 6 },
  ],
  submitLabel: 'Send message',
  pendingLabel: 'Sending…',
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-contact-form': InstanceType<typeof ContactFormElement>;
  }
}
