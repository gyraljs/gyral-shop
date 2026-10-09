// <shop-search>: the header search form with suggestions (search spec). Without JavaScript it
// is a plain GET form to /search. With it, it is an ARIA combobox: typing fetches suggestions
// (debounced; each request cancels the previous one), arrow keys move through them, Enter opens
// the highlighted one (or searches), Escape and leaving the field close the list.
// Light DOM (theme contract ADR 0006, Gyral ADR 0014): document styles in styles/search.ts.
import {
  define,
  each,
  html,
  intentsOf,
  nothing,
  prop,
  type Next,
  type TemplateResult,
} from '@gyral/core';
import { get } from '@gyral/http';
import { debounce, delay } from '@gyral/time/delay';
import { normalizeQuery, searchQueryString } from '../../domain/search.js';
import { goTo } from '../drivers/location.js';
import { suggestHref, SuggestionsSchema, type Suggestions } from './suggestions.js';

export interface SearchProps {
  /** The current query, echoed in the field. */
  readonly query?: string;
}

export interface SearchModel {
  readonly query: string;
  readonly suggestions: Suggestions | null;
  readonly open: boolean;
  /** Index into options(), for aria-activedescendant. */
  readonly highlighted: number | undefined;
  readonly status: 'idle' | 'loading' | 'error';
  /**
   * Live in the browser (Gyral's Hydrated). Until then the field is a plain search box: the
   * combobox semantics and status region describe behaviour only JavaScript provides.
   */
  readonly enhanced: boolean;
}

type Key = 'ArrowDown' | 'ArrowUp' | 'Escape';

export type SearchMsg =
  | { readonly _tag: 'Typed'; readonly query: string }
  | { readonly _tag: 'Fetch'; readonly query: string }
  | { readonly _tag: 'Loaded'; readonly suggestions: Suggestions }
  | { readonly _tag: 'Failed' }
  | { readonly _tag: 'Key'; readonly key: Key }
  | { readonly _tag: 'Pick'; readonly index: number }
  | { readonly _tag: 'Submit' }
  | { readonly _tag: 'Blurred' }
  | { readonly _tag: 'Dismiss' };

export const SUGGEST_DELAY_MS = 200;
/** Long enough for a click on a suggestion to land after the field loses focus. */
const BLUR_GRACE_MS = 150;
const MIN_QUERY = 2;

interface Option {
  readonly href: string;
  readonly label: string;
  readonly detail: string;
  readonly kind: 'department' | 'category' | 'product';
}

/** Departments, then categories (they lead to whole listings), then products. */
export const options = (s: SearchModel): readonly Option[] =>
  s.suggestions === null
    ? []
    : [
        ...s.suggestions.departments.map((d) => ({
          href: d.href,
          label: d.name,
          detail: 'Department',
          kind: 'department' as const,
        })),
        ...s.suggestions.categories.map((c) => ({
          href: c.href,
          label: c.name,
          detail: `in ${c.department}`,
          kind: 'category' as const,
        })),
        ...s.suggestions.products.map((p) => ({
          href: p.href,
          label: p.name,
          detail: `${p.brand} · ${p.price}`,
          kind: 'product' as const,
        })),
      ];

const closed = (s: SearchModel): SearchModel => ({ ...s, open: false, highlighted: undefined });

export function move(s: SearchModel, delta: 1 | -1): SearchModel {
  const n = options(s).length;
  if (n === 0) return s;
  const from = s.highlighted ?? (delta === 1 ? -1 : 0);
  return { ...s, open: true, highlighted: (from + delta + n) % n };
}

function typed(s: SearchModel, query: string): Next<SearchModel, SearchMsg> {
  const next: SearchModel = { ...closed(s), query };
  if (normalizeQuery(query).length < MIN_QUERY)
    return { ...next, suggestions: null, status: 'idle' };
  return [
    next,
    [debounce<SearchMsg>(SUGGEST_DELAY_MS, { _tag: 'Fetch', query }, 'search:suggest')],
  ];
}

function fetchSuggestions(s: SearchModel, query: string): Next<SearchModel, SearchMsg> {
  if (query !== s.query) return s; // typed over since
  const request = get<Suggestions, SearchMsg>(suggestHref(query), {
    schema: SuggestionsSchema,
    key: 'search:suggest:http',
    concurrency: 'switch',
    onSuccess: (suggestions) => ({ _tag: 'Loaded', suggestions }),
    onFailure: () => ({ _tag: 'Failed' }),
  });
  return [{ ...s, status: 'loading' }, [request]];
}

function loaded(s: SearchModel, suggestions: Suggestions): SearchModel {
  if (suggestions.query !== normalizeQuery(s.query)) return s; // an answer to an older query
  const any =
    suggestions.products.length + suggestions.departments.length + suggestions.categories.length >
    0;
  return { ...s, suggestions, status: 'idle', open: any, highlighted: undefined };
}

function submit(s: SearchModel): Next<SearchModel, SearchMsg> {
  const option = s.open && s.highlighted !== undefined ? options(s)[s.highlighted] : undefined;
  if (option !== undefined) return [closed(s), [goTo(option.href)]];
  const q = normalizeQuery(s.query);
  return [closed(s), [goTo(q === '' ? '/search' : `/search?${searchQueryString(q)}`)]];
}

const KEYS: readonly string[] = ['ArrowDown', 'ArrowUp', 'Escape'];
const isKey = (key: string): key is Key => KEYS.includes(key);

function statusText(s: SearchModel) {
  if (s.status === 'error') return 'Suggestions are unavailable right now.';
  if (!s.open) return nothing;
  const n = options(s).length;
  return `${String(n)} suggestion${n === 1 ? '' : 's'}. Use the up and down arrows to choose.`;
}

const optionId = (n: number) => `search-option-${String(n)}`;

export const SearchBox = define<SearchModel, SearchMsg, SearchProps>()('shop-search', {
  shadow: false,
  props: { query: prop.string() },
  init: (props) => ({
    query: props.query ?? '',
    suggestions: null,
    open: false,
    highlighted: undefined,
    status: 'idle',
    enhanced: false,
  }),
  intent: {
    Typed: ({ value }) => ({ _tag: 'Typed', query: value ?? '' }),
    Key: ({ key, event }) => {
      if (key === undefined || !isKey(key) || (event as KeyboardEvent).isComposing) return;
      if (key !== 'Escape') event.preventDefault(); // arrows move the highlight, not the caret
      return { _tag: 'Key', key };
    },
    Pick: ({ target }) => {
      const index = Number(target.getAttribute('data-index'));
      return Number.isInteger(index) ? { _tag: 'Pick', index } : undefined;
    },
    Submit: () => ({ _tag: 'Submit' }),
    Blurred: () => ({ _tag: 'Blurred' }),
  },
  update: {
    Typed: (s, m) => typed(s, m.query),
    Fetch: (s, m) => fetchSuggestions(s, m.query),
    Loaded: (s, m) => loaded(s, m.suggestions),
    Failed: (s) => ({ ...closed(s), status: 'error' }),
    Key: (s, m) => (m.key === 'Escape' ? closed(s) : move(s, m.key === 'ArrowDown' ? 1 : -1)),
    Pick: (s, m) => {
      const option = options(s)[m.index];
      return option === undefined ? s : [closed(s), [goTo(option.href)]];
    },
    Submit: (s) => submit(s),
    Blurred: (s) => (s.open ? [s, [delay<SearchMsg>(BLUR_GRACE_MS, { _tag: 'Dismiss' })]] : s),
    Dismiss: (s) => closed(s),
    Hydrated: (s) => ({ ...s, enhanced: true }),
  },
  view: (s, i) => html`
    <search data-region="search">
      <form action="/search" method="get" role="search" data-intent=${i.Submit}>
        <label for="q" class="visually-hidden">Search products</label>
        <span class="combo" data-intent=${i.Blurred} data-intent-on="focusout">
          <span class="keys" data-intent=${i.Key} data-intent-on="keydown">
            <input
              id="q"
              name="q"
              type="search"
              placeholder="Search everything"
              autocomplete="off"
              role=${s.enhanced ? 'combobox' : nothing}
              aria-autocomplete=${s.enhanced ? 'list' : nothing}
              aria-controls=${s.enhanced ? 'search-suggestions' : nothing}
              aria-expanded=${s.enhanced ? (s.open ? 'true' : 'false') : nothing}
              aria-activedescendant=${s.highlighted === undefined ? nothing : optionId(s.highlighted)}
              value=${s.query}
              data-intent=${i.Typed}
            />
          </span>
          ${s.enhanced ? suggestionList(s) : nothing}
        </span>
        <button type="submit">Search</button>
        ${
          s.enhanced ? html`<p class="visually-hidden" role="status">${statusText(s)}</p>` : nothing
        }
      </form>
    </search>
  `,
});

/**
 * Intent names as a module constant, so list rows stay pure (Gyral view/03-lists.md). The rows
 * declare their return types, so the class doesn't infer through them.
 */
const i = intentsOf<typeof SearchBox>();

/** One suggestion: a pure `each` row; `n` is its position, for ids and the Pick intent. */
const suggestion = (
  { option: o, n }: { readonly option: Option; readonly n: number },
  highlighted: boolean,
): TemplateResult =>
  html`<li
    id=${optionId(n)}
    role="option"
    aria-selected=${highlighted ? 'true' : 'false'}
    data-component="search-suggestion"
    data-kind=${o.kind}
    data-index=${n}
    data-intent=${i.Pick}
  >
    <span class="label">${o.label}</span>
    <span class="detail">${o.detail}</span>
  </li>`;

const suggestionList = (s: SearchModel): TemplateResult =>
  html`<ul
    id="search-suggestions"
    role="listbox"
    aria-label="Suggestions"
    data-component="search-suggestions"
    ?hidden=${!s.open}
  >
    ${each(
      options(s).map((option, n) => ({ option, n })),
      (o) => o.option.href,
      suggestion,
      (o) => o.n === s.highlighted,
    )}
  </ul>`;

declare global {
  interface HTMLElementTagNameMap {
    'shop-search': InstanceType<typeof SearchBox>;
  }
}
