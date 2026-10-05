// The member's wishlist (Gyral ADR 0013): read by every product card and product page toggle.
// The server seeds it per request; in the browser, toggles are optimistic messages whose
// commands call the wishlist JSON API (./api.ts) in one queued lane.
import { command, defineStore, type Next } from '@gyral/core';
import { wishlistApi, type WishlistAnswer, type WishlistRequest } from './api.js';

export interface WishlistNotice {
  readonly kind: 'success' | 'error';
  readonly message: string;
  readonly slug: string;
  /** Increases with every notice, so repeating the same text is announced again. */
  readonly id: number;
}

export interface WishlistState {
  /** Guests see a "sign in to save" link instead of a toggle. */
  readonly member: boolean;
  /** Saved product slugs. */
  readonly slugs: readonly string[];
  /** For the no-JS form posts (the same token as the page's csrf-token meta). */
  readonly csrf: string;
  readonly inFlight: number;
  readonly notice: WishlistNotice | undefined;
}

export type WishlistMsg =
  | { readonly _tag: 'Toggle'; readonly slug: string }
  | {
      readonly _tag: 'Answered';
      readonly slug: string;
      readonly answer: WishlistAnswer;
    }
  | { readonly _tag: 'Failed'; readonly slug: string; readonly saved: boolean };

export const guestWishlist: WishlistState = {
  member: false,
  slugs: [],
  csrf: '',
  inFlight: 0,
  notice: undefined,
};

export const FAILED_MESSAGE = "We couldn't update your wishlist. Please try again.";

const notice = (s: WishlistState, n: Omit<WishlistNotice, 'id'>): WishlistNotice => ({
  ...n,
  id: (s.notice?.id ?? 0) + 1,
});

const request = (req: WishlistRequest, saved: boolean) =>
  command(wishlistApi, req, {
    onSuccess: (answer: WishlistAnswer): WishlistMsg => ({
      _tag: 'Answered',
      slug: req.slug,
      answer,
    }),
    onFailure: (): WishlistMsg => ({ _tag: 'Failed', slug: req.slug, saved }),
    key: 'wishlist-api',
  });

function toggle(s: WishlistState, slug: string): Next<WishlistState, WishlistMsg> {
  if (!s.member) return s;
  const saved = s.slugs.includes(slug);
  const slugs = saved ? s.slugs.filter((x) => x !== slug) : [slug, ...s.slugs];
  const req: WishlistRequest = saved ? { _tag: 'Remove', slug } : { _tag: 'Save', slug };
  return [{ ...s, slugs, inFlight: s.inFlight + 1 }, [request(req, saved)]];
}

export const wishlistStore = defineStore<WishlistState, WishlistMsg>('wishlist', {
  init: () => guestWishlist,
  update: {
    Toggle: (s, m) => toggle(s, m.slug),
    Answered: (s, m) => {
      const inFlight = Math.max(0, s.inFlight - 1);
      return {
        ...s,
        inFlight,
        // Only the last answer settles the list, so an older answer never undoes a newer toggle.
        slugs: inFlight === 0 ? m.answer.slugs : s.slugs,
        notice:
          m.answer.message === undefined
            ? s.notice
            : notice(s, { kind: 'success', message: m.answer.message, slug: m.slug }),
      };
    },
    Failed: (s, m) => ({
      ...s,
      inFlight: Math.max(0, s.inFlight - 1),
      // Undo the optimistic change.
      slugs: m.saved
        ? [m.slug, ...s.slugs.filter((x) => x !== m.slug)]
        : s.slugs.filter((x) => x !== m.slug),
      notice: notice(s, { kind: 'error', message: FAILED_MESSAGE, slug: m.slug }),
    }),
  },
});

export const seededWishlist = (member: boolean, slugs: readonly string[], csrf: string) => ({
  ...guestWishlist,
  member,
  slugs,
  csrf,
});
