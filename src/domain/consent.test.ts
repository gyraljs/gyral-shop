import { describe, expect, it } from 'vitest';
import { consentFor, parseConsent, serializeConsent } from './consent.js';

describe('consent', () => {
  it('round-trips through the cookie value', () => {
    for (const analytics of [true, false]) {
      expect(parseConsent(serializeConsent({ analytics }))).toEqual({ analytics });
    }
    expect(serializeConsent({ analytics: true })).toBe('v1.a1');
  });

  it('treats missing, malformed and old-version values as undecided', () => {
    for (const raw of [undefined, '', 'yes', 'v1.a2', 'v0.a1', 'v2.a1', 'v1.a1;x']) {
      expect(parseConsent(raw)).toBeUndefined();
    }
  });

  it('maps the three buttons to a decision', () => {
    expect(consentFor('accept', false)).toEqual({ analytics: true });
    expect(consentFor('reject', true)).toEqual({ analytics: false });
    expect(consentFor('save', true)).toEqual({ analytics: true });
    expect(consentFor('save', false)).toEqual({ analytics: false });
  });
});
