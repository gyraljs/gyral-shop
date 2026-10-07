// The filter and sort form of a listing. A plain GET form to the listing's own URL, so it
// works without JavaScript; with JavaScript the listing component parses the same form into
// a listing state (intents named by the caller) and updates results without a reload.
import { html, nothing } from '@gyral/core';
import {
  activeFilterCount,
  RATINGS,
  SORT_LABELS,
  SORTS,
  type ListingState,
} from '../../domain/listing.js';
import { fixedParams, listingHref, type ListingView } from './listing-view.js';

export interface FilterIntents {
  /** On the form (submit) and on the fields wrapper (change). */
  readonly refine: string;
  /** On links that go to another state of this listing. */
  readonly go: string;
  /** On the disclosure (its `toggle` event), so the model knows whether it is open. */
  readonly toggle: string;
}

const price = (name: 'min' | 'max', label: string, value: number | null) => html`
  <label class="price-field">
    <span>${label}</span>
    <span class="money-input">
      <span aria-hidden="true">$</span>
      <input
        type="number"
        name=${name}
        min="0"
        max="999999"
        step="1"
        inputmode="numeric"
        value=${value === null ? '' : String(value)}
      />
    </span>
  </label>
`;

const sortField = (state: ListingState, relevanceLabel: string | undefined) => html`
  <p class="sort-field">
    <label for="sort">Sort by</label>
    <select id="sort" name="sort">
      ${SORTS.map(
        (sort) =>
          html`<option value=${sort} ?selected=${sort === state.sort}>
            ${sort === 'relevance' && relevanceLabel !== undefined ? relevanceLabel : SORT_LABELS[sort]}
          </option>`,
      )}
    </select>
  </p>
`;

const brandFieldset = (view: ListingView) =>
  view.brands.length === 0
    ? nothing
    : html`<fieldset>
        <legend>Brand</legend>
        <ul class="options">
          ${view.brands.map(
            (brand) =>
              html`<li>
                <label>
                  <input
                    type="checkbox"
                    name="brand"
                    value=${brand.slug}
                    ?checked=${view.state.brands.includes(brand.slug)}
                  />
                  ${brand.name} <span class="count">(${brand.count})</span>
                </label>
              </li>`,
          )}
        </ul>
      </fieldset>`;

const ratingFieldset = (state: ListingState) => html`
  <fieldset>
    <legend>Customer rating</legend>
    <ul class="options">
      <li>
        <label
          ><input type="radio" name="rating" value="" ?checked=${state.rating === null} /> Any
          rating</label
        >
      </li>
      ${RATINGS.map(
        (rating) =>
          html`<li>
            <label
              ><input
                type="radio"
                name="rating"
                value=${rating}
                ?checked=${state.rating === rating}
              />
              ${rating} ${rating === 1 ? 'star' : 'stars'} &amp; up</label
            >
          </li>`,
      )}
    </ul>
  </fieldset>
`;

/**
 * Filter and sort controls for a listing view. `open` is the disclosure as the shopper left it
 * (`undefined`: not touched yet). Gyral writes `?open` whenever its value changes
 * (view/02-bindings.md), so without the shopper's own toggles in the model, unticking the last
 * filter (active count 1 → 0) would close the panel under their hand, and going Back to a
 * filtered URL would reopen a panel they had closed.
 */
export const filtersForm = (
  view: ListingView,
  intents: FilterIntents,
  open: boolean | undefined,
) => {
  const { state } = view;
  const active = activeFilterCount(state);
  // A disclosure so filters don't push results off narrow screens; wide containers show it
  // expanded with no toggle (filtersCss). Open by default when filters are applied.
  return html`
    <form
      class="filters"
      data-region="filters"
      method="get"
      action=${view.basePath}
      aria-label="Filter and sort"
      data-intent=${intents.refine}
    >
      ${fixedParams(view).map(
        ([name, value]) => html`<input type="hidden" name=${name} value=${value} />`,
      )}
      <details
        class="filters-panel"
        data-component="filters-panel"
        ?open=${open ?? active > 0}
        data-intent=${intents.toggle}
        data-intent-on="toggle"
      >
        <summary>
          Filter and
          sort${active > 0 ? html` <span class="count">(${active} active)</span>` : nothing}
        </summary>
        <div class="filter-fields" data-intent=${intents.refine} data-intent-on="change">
          ${sortField(state, view.relevanceLabel)}
          <fieldset>
            <legend>Price</legend>
            <div class="price-range">
              ${price('min', 'Min', state.minPrice)} ${price('max', 'Max', state.maxPrice)}
            </div>
          </fieldset>
          ${brandFieldset(view)} ${ratingFieldset(state)}
          <fieldset>
            <legend>Availability</legend>
            <ul class="options">
              <li>
                <label
                  ><input type="checkbox" name="stock" value="1" ?checked=${state.inStock} /> In
                  stock</label
                >
              </li>
              <li>
                <label
                  ><input type="checkbox" name="sale" value="1" ?checked=${state.onSale} /> On
                  sale</label
                >
              </li>
            </ul>
          </fieldset>
        </div>
        <p class="filter-actions">
          <button type="submit">Apply</button>
          <a href=${listingHref(view, {})} data-intent=${intents.go}>Clear all</a>
        </p>
      </details>
    </form>
  `;
};
