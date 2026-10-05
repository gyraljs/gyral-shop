// <shop-reviews>: the reviews section as a lazy island (Gyral `hydrate: 'visible'`, ADR 0012):
// below the fold, so its code wakes only when scrolled near. Until then (and without JS) it is
// server HTML whose sort/page links and vote forms work on their own. Once hydrated, sorting
// and paging load in place from the JSON endpoint, and helpful votes post without a reload.
import { define, focus, type Next } from '@gyral/core';
import { request } from '@gyral/http';
import { isReviewSort, parseReviewPage } from '../../domain/reviews.js';
import { CSRF_META } from '../forms/csrf.js';
import {
  helpfulPath,
  reviewsApiPath,
  reviewsHref,
  ReviewsViewSchema,
  VotedSchema,
  VoteErrorSchema,
  type ReviewsViewData,
} from './reviews-model.js';
import { reviewsSection, type Notice } from './reviews-view.js';
import * as v from 'valibot';

export interface ReviewsProps {
  readonly view: ReviewsViewData;
  readonly csrfToken?: string;
  /** Where sort and page links point (product page: the reviews page). */
  readonly listPath: string;
  /** A message from the server (flash after a no-JS post). */
  readonly notice?: Notice;
  /** True on the reviews page (the section title is the page's h1). */
  readonly standalone?: boolean;
}

interface State {
  readonly view: ReviewsViewData;
  readonly loading: boolean;
  readonly notice: Notice | undefined;
  readonly voting: readonly number[];
}

type Msg =
  | { readonly _tag: 'Load'; readonly sort: ReviewsViewData['sort']; readonly page: number }
  | { readonly _tag: 'Loaded'; readonly view: ReviewsViewData }
  | { readonly _tag: 'LoadFailed' }
  | { readonly _tag: 'Vote'; readonly reviewId: number }
  | { readonly _tag: 'Voted'; readonly reviewId: number; readonly helpfulCount: number }
  | { readonly _tag: 'VoteFailed'; readonly reviewId: number; readonly message: string };

const LOAD_FAILED: Notice = { kind: 'error', message: "We couldn't load more reviews. Try again." };
const VOTE_FAILED = "We couldn't record your vote. Try again.";

/** A plain, same-page click on a sort or page link (modified clicks keep their default). */
function linkTarget(event: Event, target: Element): URL | undefined {
  if (!(event instanceof MouseEvent) || event.button !== 0) return undefined;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return undefined;
  if (!(target instanceof HTMLAnchorElement)) return undefined;
  return new URL(target.href);
}

const voteError = (body: unknown): string => {
  const parsed = v.safeParse(VoteErrorSchema, body);
  return parsed.success ? parsed.output.message : VOTE_FAILED;
};

function load(s: State, sort: ReviewsViewData['sort'], page: number): Next<State, Msg> {
  const url = reviewsHref(reviewsApiPath(s.view.slug), sort, page);
  return [
    { ...s, loading: true, notice: undefined },
    [
      request(
        { url },
        {
          schema: ReviewsViewSchema,
          onSuccess: (view): Msg => ({ _tag: 'Loaded', view }),
          onFailure: (): Msg => ({ _tag: 'LoadFailed' }),
          key: 'reviews',
          concurrency: 'switch',
        },
      ),
    ],
  ];
}

const mapItems = (s: State, id: number, f: (r: ReviewsViewData['items'][number]) => typeof r) => ({
  ...s.view,
  items: s.view.items.map((r) => (r.id === id ? f(r) : r)),
});

export const Reviews = define<State, Msg, ReviewsProps>('shop-reviews', {
  shadow: false,
  hydrate: 'visible',
  props: {
    view: { attribute: false, required: true },
    csrfToken: { attribute: 'csrf-token' },
    listPath: { attribute: 'list-path', required: true },
    notice: { attribute: false },
    standalone: { type: Boolean, default: false },
  },
  init: (props) => ({ view: props.view, loading: false, notice: props.notice, voting: [] }),
  intent: {
    Load: ({ event, target }) => {
      const url = linkTarget(event, target);
      if (url === undefined) return undefined;
      const sort = url.searchParams.get('sort') ?? 'helpful';
      const page = parseReviewPage(url.searchParams.get('page') ?? undefined);
      if (!isReviewSort(sort) || page === undefined) return undefined;
      event.preventDefault(); // load in place instead of navigating
      return { _tag: 'Load', sort, page };
    },
    Vote: ({ formData }) => {
      const id = Number(formData?.get('reviewId'));
      return Number.isInteger(id) && id > 0 ? { _tag: 'Vote', reviewId: id } : undefined;
    },
  },
  update: {
    Load: (s, m) => load(s, m.sort, m.page),
    Loaded: (s, m) => [{ ...s, view: m.view, loading: false }, [focus('#reviews-title')]],
    LoadFailed: (s) => ({ ...s, loading: false, notice: LOAD_FAILED }),
    Vote: (s, m) => [
      { ...s, voting: [...s.voting, m.reviewId] },
      [
        request(
          { url: helpfulPath(m.reviewId), method: 'POST', csrf: { meta: CSRF_META } },
          {
            schema: VotedSchema,
            errorSchema: VoteErrorSchema,
            onSuccess: ({ helpfulCount }): Msg => ({
              _tag: 'Voted',
              reviewId: m.reviewId,
              helpfulCount,
            }),
            onFailure: (error): Msg => ({
              _tag: 'VoteFailed',
              reviewId: m.reviewId,
              message: error._tag === 'HttpStatusError' ? voteError(error.body) : VOTE_FAILED,
            }),
            key: `vote-${String(m.reviewId)}`,
            concurrency: 'exhaust',
          },
        ),
      ],
    ],
    Voted: (s, m) => ({
      ...s,
      voting: s.voting.filter((id) => id !== m.reviewId),
      view: mapItems(s, m.reviewId, (r) => ({ ...r, voted: true, helpfulCount: m.helpfulCount })),
      notice: { kind: 'success', message: 'Thanks, your vote was counted.' },
    }),
    VoteFailed: (s, m) => ({
      ...s,
      voting: s.voting.filter((id) => id !== m.reviewId),
      notice: { kind: 'error', message: m.message },
    }),
  },
  view: (s, i, { props }) =>
    reviewsSection(
      {
        view: s.view,
        loading: s.loading,
        notice: s.notice,
        voting: s.voting,
        csrfToken: props.csrfToken,
        listPath: props.listPath,
        standalone: props.standalone ?? false,
      },
      i,
    ),
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-reviews': InstanceType<typeof Reviews>;
  }
}
