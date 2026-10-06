// <shop-consent>: the cookie consent banner and settings form (docs/product-specs/consent.md).
// A non-modal region, never a dialog: the page stays usable while it is open. Without
// JavaScript it is a POST form to /consent that redirects back. With it, the same form is sent
// with submitForm and the banner closes in place. Light DOM (theme contract, ADR 0006).
import { changed, define, defineForm, form, html, nothing, prop, send } from '@gyral/core';
import { submitForm } from '@gyral/http';
import { pageViewBeacon } from '../analytics/beacon.js';
import { loadedMe, meStore } from '../me/store.js';
import * as v from 'valibot';

/** One schema for the browser and the server's formAction (Gyral ADR 0008). */
export const ConsentForm = defineForm(
  v.object({
    choice: v.picklist(['accept', 'reject', 'save']),
    analytics: v.optional(v.literal('on')),
    return: v.optional(v.pipe(v.string(), v.maxLength(2000))),
  }),
);

export interface ConsentProps {
  /** `banner` on first visits; `page` on /consent (cookie settings, re-openable any time). */
  readonly mode?: 'banner' | 'page';
  /** The current choice for analytics (settings page), unset when undecided. */
  readonly analytics?: boolean;
  /** Where the no-JS form returns to after saving. */
  readonly returnTo?: string;
  /**
   * On a prerendered page the server can't know the visitor: start closed and, once hydrated,
   * ask `/api/me` whether they already chose (no banner without JavaScript there).
   */
  readonly deferred?: boolean;
}

/** Kept in sync with src/server/routes/me.ts (ui may not import server code). */
export interface ConsentModel {
  readonly open: boolean;
  readonly saving: boolean;
  readonly message: string | null;
  /**
   * The analytics box and the "Customize" disclosure. Form state is live in Gyral 0.3
   * (view/02-bindings.md), so the model holds what the visitor chose: a render while saving
   * must not untick the box or close the disclosure.
   */
  readonly analytics: boolean;
  readonly customizing: boolean;
}

export type ConsentMsg =
  | { readonly _tag: 'Choose'; readonly form: FormData }
  | { readonly _tag: 'Customize'; readonly open: boolean }
  | { readonly _tag: 'Saved' }
  | { readonly _tag: 'Failed' };

const FAILED = 'Your choice could not be saved. Please try again.';

export const ConsentBox = define<ConsentModel, ConsentMsg, ConsentProps>('shop-consent', {
  stores: [meStore],
  shadow: false,
  props: {
    mode: prop.string({ schema: v.picklist(['banner', 'page']) }),
    analytics: prop.boolean(),
    returnTo: prop.string(),
    deferred: prop.boolean(),
  },
  init: (props) => ({
    open: props.deferred !== true,
    saving: false,
    message: null,
    analytics: props.analytics === true,
    customizing: props.mode === 'page',
  }),
  intent: {
    Choose: form(ConsentForm, (_data, raw) => ({ _tag: 'Choose', form: raw })),
    Customize: ({ target }) =>
      target instanceof HTMLDetailsElement ? { _tag: 'Customize', open: target.open } : undefined,
  },
  update: {
    Customize: (s, m) => ({ ...s, customizing: m.open }),
    Choose: (s, m) => [
      { ...s, saving: true, message: null, analytics: m.form.get('analytics') === 'on' },
      [
        submitForm<ConsentMsg, ConsentMsg>('/consent', m.form, {
          onSuccess: () => ({ _tag: 'Saved' }),
          onFailure: () => ({ _tag: 'Failed' }),
          key: 'consent',
        }),
      ],
    ],
    Saved: (s, _m, { props }) =>
      props.mode === 'page'
        ? { ...s, saving: false, message: 'Your choices are saved.' }
        : { ...s, saving: false, open: false },
    Failed: (s) => ({ ...s, saving: false, message: FAILED }),
    // Static pages (deferred): ask the shared visitor store (one /api/me per page, shop-7bj).
    Hydrated: (s, _m, { props }) =>
      props.deferred === true ? [s, [send(meStore, { _tag: 'Load' })]] : s,
    // Once known: open the banner only for visitors who haven't chosen, and count the page
    // view of a static page when they accepted analytics (shop-8c2).
    StoreChanged: (s, m, { props }) => {
      const me =
        props.deferred === true
          ? loadedMe(changed(meStore, m)?.state ?? { status: 'idle' })
          : undefined;
      if (me === undefined) return s;
      const next = { ...s, open: !me.consentDecided };
      return me.analytics ? [next, [pageViewBeacon(location.pathname)]] : next;
    },
    IntentRejected: (s) => ({ ...s, saving: false, message: FAILED }),
  },
  view: (s, i, { props }) => {
    if (!s.open) return nothing;
    const page = props.mode === 'page';
    return html`
      <section
        class=${page ? 'consent consent-page' : 'consent consent-banner'}
        data-region="consent"
        aria-labelledby="consent-title"
      >
        <h2 id="consent-title">${page ? 'Cookie settings' : 'Cookies on Gyral Goods'}</h2>
        <p>
          We use strictly necessary cookies to run the store (your session, cart and security). With
          your permission we also count page views and add-to-cart clicks to improve the store.
          Nothing is shared with anyone.
        </p>
        <form method="post" action="/consent" data-intent=${i.Choose}>
          <input type="hidden" name="return" value=${props.returnTo ?? '/'} />
          <div class="consent-actions" data-component="consent-actions">
            <button type="submit" name="choice" value="accept" ?disabled=${s.saving}>
              Accept all
            </button>
            <button type="submit" name="choice" value="reject" ?disabled=${s.saving}>
              Reject non-essential
            </button>
          </div>
          <details
            class="consent-custom"
            data-component="consent-custom"
            ?open=${s.customizing}
            data-intent=${i.Customize}
            data-intent-on="toggle"
          >
            <summary>Customize</summary>
            <fieldset>
              <legend>Cookie categories</legend>
              <label>
                <input type="checkbox" checked disabled />
                Strictly necessary <small>(always on)</small>
              </label>
              <label>
                <input type="checkbox" name="analytics" ?checked=${s.analytics} />
                Analytics <small>(page views and add-to-cart clicks)</small>
              </label>
            </fieldset>
            <button type="submit" name="choice" value="save" ?disabled=${s.saving}>
              Save choices
            </button>
          </details>
        </form>
        ${s.message === null ? nothing : html`<p role="status">${s.message}</p>`}
      </section>
    `;
  },
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-consent': InstanceType<typeof ConsentBox>;
  }
}
