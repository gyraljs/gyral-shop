// <shop-listing>: one listing's heading, result count, filter/sort form, product grid and
// pager. Light DOM (Gyral ADR 0014): crawlers read the heading and products as plain HTML and
// document styles (filters.ts, listing.ts, catalog.ts) apply directly. Server-rendered from a ListingView; in the browser it changes listing state without a
// reload. The URL is the source of truth: intents navigate (pushing history), and every URL
// change (including Back/Forward) streams in through router listen() and fetches that state.
import { define, focus, html, nothing, prop, type Next } from '@gyral/core';
import { get, type HttpError } from '@gyral/http';
import { listen, makeRouter, navigate, setHead, type RouteLocation } from '@gyral/router';
import { isRefined, parseListing, sameListing, type ListingState } from '../../domain/listing.js';
import { filtersForm } from './filters.js';
import { listingHead } from './listing-head.js';
import { listingHref, ListingViewSchema, resultSummary, type ListingView } from './listing-view.js';
import { pager } from './pager.js';
import { productCard } from './product-card.js';

export interface ListingProps {
  /** Set by the server render; the browser restores it from the hydration seed. */
  readonly view: ListingView;
}

export interface ListingModel {
  readonly view: ListingView | null;
  /** The state the URL asks for. Results are applied only if they answer it. */
  readonly want: ListingState | null;
  readonly status: 'idle' | 'loading' | 'error';
  readonly focusPending: boolean;
  /** The filter disclosure as the shopper left it; `null` until they toggle it (filters.ts). */
  readonly filtersOpen: boolean | null;
  /** The page's origin, from the last routed URL: the head's canonical URL is absolute. */
  readonly origin: string | null;
}

export type ListingMsg =
  | { readonly _tag: 'Refine'; readonly state: ListingState }
  | { readonly _tag: 'Go'; readonly state: ListingState }
  | { readonly _tag: 'Routed'; readonly location: RouteLocation }
  | { readonly _tag: 'Loaded'; readonly view: ListingView }
  | { readonly _tag: 'Failed'; readonly error: HttpError['_tag'] }
  | { readonly _tag: 'FiltersToggled'; readonly open: boolean };

/**
 * This page's router: it never captures link clicks. The store is a multi-page app; only the
 * listing's own links (pager, clear) are handled in-page, through intents.
 */
export const listingRouter = makeRouter({ captureLinks: false });

const stateOf = (params: URLSearchParams): ListingState => {
  const parsed = parseListing(params);
  return parsed.ok ? parsed.value : parsed.error.state;
};

const formParams = (data: FormData): URLSearchParams => {
  const params = new URLSearchParams();
  for (const [key, value] of data) if (typeof value === 'string') params.append(key, value);
  return params;
};

/** Plain clicks only: modified or middle clicks open new tabs the browser's way. */
const plainClick = (event: Event): boolean =>
  !(event instanceof MouseEvent) ||
  (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey);

/** Go to a listing state: push it to the URL; the Routed message that follows loads it. */
function go(s: ListingModel, state: ListingState, focus: boolean): Next<ListingModel, ListingMsg> {
  const current = s.want ?? s.view?.state;
  if (s.view === null || (current !== undefined && sameListing(current, state))) return s;
  // `want` first: controls render the shopper's choice while the new results load.
  return [{ ...s, want: state, focusPending: focus }, [navigate(listingHref(s.view, state))]];
}

function routed(s: ListingModel, location: RouteLocation): Next<ListingModel, ListingMsg> {
  const { view } = s;
  if (view === null || location.pathname !== view.basePath) return s;
  const want = stateOf(new URLSearchParams(location.search));
  const origin = new URL(location.href).origin;
  if (sameListing(want, view.state)) return { ...s, want, origin, status: 'idle' };
  const api = {
    basePath: view.api,
    ...(view.fixedQuery === undefined ? {} : { fixedQuery: view.fixedQuery }),
  };
  const request = get<ListingView, ListingMsg>(listingHref(api, want), {
    schema: ListingViewSchema,
    key: 'listing',
    concurrency: 'switch',
    onSuccess: (next) => ({ _tag: 'Loaded', view: next }),
    onFailure: (error) => ({ _tag: 'Failed', error: error._tag }),
  });
  return [{ ...s, want, origin, status: 'loading' }, [request]];
}

function loaded(s: ListingModel, view: ListingView): Next<ListingModel, ListingMsg> {
  if (s.want !== null && !sameListing(view.state, s.want)) return s; // an answer to an old URL
  const next: ListingModel = { ...s, view, status: 'idle', focusPending: false };
  const head = s.origin === null ? [] : [setHead(listingHead(view, s.origin))];
  // After paging, move focus to the heading so keyboard and screen-reader users land on the
  // new results (Gyral's focus() runs after the update renders).
  return [next, s.focusPending ? [...head, focus('#listing-title')] : head];
}

const results = (view: ListingView) => {
  if (view.cards.length > 0) {
    return html`<div class="card-grid" data-component="card-grid">
      ${view.cards.map((card, n) => productCard(card, view.state.page === 1 && n < 4))}
    </div>`;
  }
  return isRefined(view.state)
    ? html`<p class="empty">No products match these filters.</p>`
    : html`<p class="empty">There are no products here yet.</p>`;
};

export const Listing = define<ListingModel, ListingMsg, ListingProps>()('shop-listing', {
  shadow: false,
  props: { view: prop.value(ListingViewSchema, { required: true }) },
  init: (props) => [
    {
      view: props.view,
      want: null,
      status: 'idle',
      focusPending: false,
      filtersOpen: null,
      origin: null,
    },
    [listen((location) => ({ _tag: 'Routed', location }))],
  ],
  drivers: { router: listingRouter },
  intent: {
    Refine: ({ formData, target }) => {
      const form = target instanceof HTMLFormElement ? target : target.closest('form');
      const data = formData ?? (form === null ? undefined : new FormData(form));
      return data === undefined
        ? undefined
        : { _tag: 'Refine', state: { ...stateOf(formParams(data)), page: 1 } };
    },
    Go: ({ event, target }) => {
      const href = target.getAttribute('href');
      if (href === null || !plainClick(event)) return undefined;
      event.preventDefault();
      return { _tag: 'Go', state: stateOf(new URL(href, document.baseURI).searchParams) };
    },
    FiltersToggled: ({ target }) =>
      target instanceof HTMLDetailsElement
        ? { _tag: 'FiltersToggled', open: target.open }
        : undefined,
  },
  update: {
    Refine: (s, m) => go(s, m.state, false),
    Go: (s, m) => go(s, m.state, true),
    Routed: (s, m) => routed(s, m.location),
    Loaded: (s, m) => loaded(s, m.view),
    Failed: (s) => ({ ...s, status: 'error' }),
    FiltersToggled: (s, m) => ({ ...s, filtersOpen: m.open }),
  },
  states: (s) => ({ loading: s.status === 'loading' }),
  view: (s, i) => {
    const { view } = s;
    if (view === null) return nothing;
    const { state } = view;
    return html`
      <section class="listing-results" data-region="listing" aria-labelledby="listing-title">
        <header class="listing-header">
          <h1 id="listing-title" tabindex="-1">
            ${view.heading}${
              state.page > 1
                ? html`<span class="visually-hidden">, page ${state.page}</span>`
                : nothing
            }
          </h1>
          <p class="result-count" role="status">${resultSummary(view)}</p>
        </header>
        ${filtersForm(
          { ...view, state: s.want ?? state },
          { refine: i.Refine, go: i.Go, toggle: i.FiltersToggled },
          s.filtersOpen ?? undefined,
        )}
        ${
          s.status === 'error'
            ? html`<p class="load-error" role="alert">
                The results couldn’t be updated.
                <a href=${listingHref(view, s.want ?? state)}>Load them again</a>
              </p>`
            : nothing
        }
        <div
          class="results"
          data-region="results"
          aria-busy=${s.status === 'loading' ? 'true' : 'false'}
        >
          <h2 class="visually-hidden">Products</h2>
          ${results(view)}
        </div>
        ${pager({
          page: state.page,
          pageCount: view.pageCount,
          href: (page) => listingHref(view, { ...state, page }),
          intent: i.Go,
        })}
      </section>
    `;
  },
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-listing': InstanceType<typeof Listing>;
  }
}
