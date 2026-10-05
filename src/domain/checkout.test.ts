import { describe, expect, it } from 'vitest';
import {
  CHECKOUT_STEPS,
  addressLines,
  cardLabel,
  firstIncomplete,
  normalizePostalCode,
  openStep,
  readyToPlace,
  stepStatuses,
  type CheckoutDraft,
} from './checkout.js';

const address = {
  name: 'Ada Lovelace',
  line1: '1 Analytical Way',
  line2: '',
  city: 'Albany',
  state: 'NY',
  postalCode: '12207',
  phone: '',
} as const;
const card = {
  paymentRef: 'pi_1',
  brand: 'visa',
  last4: '4242',
  expMonth: 4,
  expYear: 2031,
} as const;

const drafts: readonly CheckoutDraft[] = [
  {},
  { email: 'a@b.co' },
  { email: 'a@b.co', address },
  { email: 'a@b.co', address, shippingMethod: 'express' },
  { email: 'a@b.co', address, shippingMethod: 'express', card },
];

describe('checkout steps', () => {
  it('opens the first step that is missing data', () => {
    expect(drafts.map(firstIncomplete)).toEqual(CHECKOUT_STEPS);
    expect(drafts.map(readyToPlace)).toEqual([false, false, false, false, true]);
  });

  it('honours an edit up to the first incomplete step, never beyond', () => {
    const partial = drafts[2] ?? {};
    expect(openStep(partial, 'contact')).toBe('contact');
    expect(openStep(partial, 'shipping')).toBe('shipping'); // the first incomplete step
    expect(openStep(partial, 'payment')).toBe('shipping'); // can't skip ahead
    expect(openStep(partial)).toBe('shipping');
  });

  it('marks exactly one step open, saved earlier steps done, the rest locked', () => {
    for (const draft of drafts) {
      for (const edit of [undefined, ...CHECKOUT_STEPS]) {
        const statuses = stepStatuses(draft, edit);
        expect(statuses.filter((s) => s.status === 'open')).toHaveLength(1);
        const first = CHECKOUT_STEPS.indexOf(firstIncomplete(draft));
        statuses.forEach(({ step, status }, index) => {
          if (status === 'done') expect(index).toBeLessThan(first);
          if (index > first) expect(status).toBe('locked');
          if (step === 'review') expect(status).not.toBe('done');
        });
      }
    }
  });

  it('keeps later saved steps done while an earlier one is edited', () => {
    const full = drafts[4] ?? {};
    expect(stepStatuses(full, 'address').map((s) => s.status)).toEqual([
      'done',
      'open',
      'done',
      'done',
      'locked',
    ]);
  });
});

describe('addresses and cards', () => {
  it('normalizes US postal codes', () => {
    expect(normalizePostalCode(' 12207 ')).toBe('12207');
    expect(normalizePostalCode('12207-1234')).toBe('12207-1234');
    expect(normalizePostalCode('122071234')).toBe('12207-1234');
    expect(normalizePostalCode('1220')).toBeUndefined();
    expect(normalizePostalCode('ABCDE')).toBeUndefined();
  });

  it('formats summaries without empty lines', () => {
    expect(addressLines(address)).toEqual(['Ada Lovelace', '1 Analytical Way', 'Albany, NY 12207']);
    expect(cardLabel(card)).toBe('Visa ending 4242, expires 04/31');
  });
});
