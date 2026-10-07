// "Save to wishlist" on product cards and product pages (wishlist-reviews spec). Light DOM
// (theme contract, ADR 0006): a plain form post without JavaScript; with it, an optimistic
// toggle through the wishlist store. Guests get a link that remembers the product and asks
// them to sign in (routes/wishlist.ts), after which it is saved.
import { define, html, nothing, prop, send, type Stateless } from '@gyral/core';
import { csrfField } from '../forms/csrf.js';
import { wishlistStore } from './store.js';

export interface ToggleProps {
  readonly slug: string;
  readonly name: string;
  /** Where to come back to after a no-JS post or signing in. */
  readonly next: string;
}

type Msg = { readonly _tag: 'Toggle' };

const heart = (saved: boolean) =>
  html`<span class="heart" aria-hidden="true">${saved ? '♥' : '♡'}</span>`;

export const WishToggle = define<Stateless, Msg, ToggleProps>('shop-wish-toggle', {
  shadow: false,
  props: {
    slug: prop.string({ required: true }),
    name: prop.string({ required: true }),
    next: prop.string({ default: '' }),
  },
  stores: [wishlistStore],
  intent: { Toggle: () => ({ _tag: 'Toggle' }) },
  update: {
    Toggle: (s, _m, { props }) => [s, [send(wishlistStore, { _tag: 'Toggle', slug: props.slug })]],
  },
  view: (_s, i, { props, read }) => {
    const w = read(wishlistStore);
    const back = props.next === '' ? `/p/${props.slug}` : props.next;
    if (!w.member) {
      const href = `/wishlist/sign-in?product=${encodeURIComponent(props.slug)}&next=${encodeURIComponent(back)}`;
      return html`<a class="wish-toggle" data-component="wishlist-toggle" href=${href}
        >${heart(false)} Save<span class="visually-hidden"> ${props.name} to your wishlist</span></a
      >`;
    }
    const saved = w.slugs.includes(props.slug);
    const n = w.notice;
    return html`<form
      class="wish-toggle"
      data-component="wishlist-toggle"
      method="post"
      action=${saved ? '/wishlist/remove' : '/wishlist/add'}
      data-intent=${i.Toggle}
    >
      ${csrfField(w.csrf)}
      <input type="hidden" name="product" value=${props.slug} />
      ${props.next === '' ? nothing : html`<input type="hidden" name="next" value=${props.next} />`}
      <button type="submit" aria-pressed=${saved ? 'true' : 'false'}>
        ${heart(saved)} Save<span class="visually-hidden"> ${props.name} to your wishlist</span>
      </button>
      <span class="visually-hidden" role="status"
        >${n !== undefined && n.slug === props.slug ? n.message : nothing}</span
      >
    </form>`;
  },
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-wish-toggle': InstanceType<typeof WishToggle>;
  }
}
