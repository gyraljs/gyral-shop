// Cookie consent (docs/product-specs/consent.md). Strictly necessary cookies (session, CSRF,
// cart, this choice) need no consent; analytics does. Undecided visitors see the banner.

export interface Consent {
  readonly analytics: boolean;
}

export type ConsentChoice = 'accept' | 'reject' | 'save';

/** Bump when the categories change, so everyone is asked again. */
export const CONSENT_VERSION = 1;

/** The cookie value, e.g. `v1.a1`. */
export const serializeConsent = (consent: Consent): string =>
  `v${String(CONSENT_VERSION)}.a${consent.analytics ? '1' : '0'}`;

/** `undefined` when there is no decision for the current version (ask again). */
export function parseConsent(raw: string | undefined): Consent | undefined {
  const match = /^v(\d+)\.a([01])$/.exec(raw ?? '');
  if (match === null || Number(match[1]) !== CONSENT_VERSION) return undefined;
  return { analytics: match[2] === '1' };
}

/** What a button press means: accept all, reject non-essential, or save the custom choice. */
export function consentFor(choice: ConsentChoice, analyticsChecked: boolean): Consent {
  switch (choice) {
    case 'accept':
      return { analytics: true };
    case 'reject':
      return { analytics: false };
    case 'save':
      return { analytics: analyticsChecked };
  }
}
