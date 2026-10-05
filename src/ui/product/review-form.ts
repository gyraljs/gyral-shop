// Writing a review (docs/product-specs/wishlist-reviews.md): one valibot schema for the
// browser's form() and the server's formAction(), rendered by the shared light-DOM member form
// (same markup with and without JavaScript).
import { defineForm } from '@gyral/core';
import * as v from 'valibot';
import {
  REVIEW_BODY_MAX,
  REVIEW_BODY_MIN,
  REVIEW_TITLE_MAX,
  REVIEW_TITLE_MIN,
} from '../../domain/reviews.js';
import { defineMemberForm } from '../forms/member-form.js';

export const RATING_OPTIONS = [
  { value: '5', label: '5 stars: excellent' },
  { value: '4', label: '4 stars: good' },
  { value: '3', label: '3 stars: average' },
  { value: '2', label: '2 stars: poor' },
  { value: '1', label: '1 star: terrible' },
] as const;

export const ReviewForm = defineForm(
  v.object({
    rating: v.pipe(
      v.picklist(
        RATING_OPTIONS.map((o) => o.value),
        'Choose a rating.',
      ),
      v.transform(Number),
    ),
    title: v.pipe(
      v.string(),
      v.trim(),
      v.minLength(
        REVIEW_TITLE_MIN,
        `Give it a title of at least ${String(REVIEW_TITLE_MIN)} characters.`,
      ),
      v.maxLength(REVIEW_TITLE_MAX, `Keep the title under ${String(REVIEW_TITLE_MAX)} characters.`),
    ),
    body: v.pipe(
      v.string(),
      v.trim(),
      v.minLength(REVIEW_BODY_MIN, `Write at least ${String(REVIEW_BODY_MIN)} characters.`),
      v.maxLength(REVIEW_BODY_MAX, `Keep it under ${String(REVIEW_BODY_MAX)} characters.`),
    ),
  }),
);

export const ReviewFormElement = defineMemberForm({
  tag: 'shop-review-form',
  // Each product page sets its own action (`/p/<slug>/review`) through the `action` prop.
  action: '/',
  form: ReviewForm,
  fields: [
    { kind: 'select', name: 'rating', label: 'Your rating', options: RATING_OPTIONS },
    {
      kind: 'text',
      name: 'title',
      label: 'Title',
      autocomplete: 'off',
      minlength: REVIEW_TITLE_MIN,
      maxlength: REVIEW_TITLE_MAX,
    },
    {
      kind: 'textarea',
      name: 'body',
      label: 'Your review',
      hint: 'What did you like or dislike? How did you use it?',
      maxlength: REVIEW_BODY_MAX,
      rows: 6,
    },
  ],
  submitLabel: 'Post review',
  pendingLabel: 'Posting…',
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-review-form': InstanceType<typeof ReviewFormElement>;
  }
}
