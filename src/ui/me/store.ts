// Who is visiting, for pages prerendered at build time (shop-7bj). Static pages carry no
// per-visitor data, so after hydration the header (account), the consent banner (has this
// visitor chosen?) and the analytics beacon all need `GET /api/me`. One shared store makes
// that ONE request per page: the first `Load` fetches, later ones are no-ops.
import { defineStore } from '@gyral/core';
import { get } from '@gyral/http';
import * as v from 'valibot';

/** Kept in sync with src/server/routes/me.ts (ui may not import server code). */
export const ME_PATH = '/api/me';

export const MeSchema = v.object({
  account: v.nullable(v.object({ firstName: v.string(), csrfToken: v.string() })),
  consentDecided: v.boolean(),
  /** The visitor accepted analytics (consent.md); checked again on the server. */
  analytics: v.boolean(),
  /** The visitor's theme (ADR 0006 rule 8), for the switcher on prerendered pages. */
  theme: v.optional(v.string()),
});

export type Me = v.InferOutput<typeof MeSchema>;

export type MeState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly me: Me }
  | { readonly status: 'failed' };

export type MeMsg =
  | { readonly _tag: 'Load' }
  | { readonly _tag: 'Loaded'; readonly me: Me }
  | { readonly _tag: 'Failed' };

export const meStore = defineStore<MeState, MeMsg>('me', {
  init: () => ({ status: 'idle' }),
  update: {
    Load: (s) =>
      s.status !== 'idle'
        ? s
        : [
            { status: 'loading' },
            [
              get(ME_PATH, {
                schema: MeSchema,
                onSuccess: (me): MeMsg => ({ _tag: 'Loaded', me }),
                onFailure: (): MeMsg => ({ _tag: 'Failed' }),
                key: 'me',
              }),
            ],
          ],
    Loaded: (_s, m) => ({ status: 'loaded', me: m.me }),
    Failed: () => ({ status: 'failed' }),
  },
});

/** The loaded visitor, if any. */
export const loadedMe = (s: MeState): Me | undefined => (s.status === 'loaded' ? s.me : undefined);
