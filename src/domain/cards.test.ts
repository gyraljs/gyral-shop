import { describe, expect, it } from 'vitest';
import {
  chargeOutcomeMessage,
  detectBrand,
  isExpired,
  luhnValid,
  parseExpiry,
  testCardOutcome,
  validateCard,
} from './cards.js';

const now = new Date('2026-10-04T12:00:00Z');
const TEST_CARDS = ['4242424242424242', '4000000000000002', '4000000000009995', '4000000000000119'];

describe('cards', () => {
  it('accepts the documented test cards (Luhn) and rejects typos', () => {
    for (const card of TEST_CARDS) expect(luhnValid(card)).toBe(true);
    expect(luhnValid('4242424242424241')).toBe(false);
    expect(luhnValid('42')).toBe(false);
  });

  it('detects brands by prefix and length', () => {
    expect(detectBrand('4242424242424242')).toBe('visa');
    expect(detectBrand('5555555555554444')).toBe('mastercard');
    expect(detectBrand('2223003122003222')).toBe('mastercard');
    expect(detectBrand('378282246310005')).toBe('amex');
    expect(detectBrand('6011111111111117')).toBe('discover');
    expect(detectBrand('3530111333300000')).toBeUndefined(); // JCB: not accepted
  });

  it('parses expiry and treats the whole month as valid', () => {
    expect(parseExpiry('10/26')).toEqual({ month: 10, year: 2026 });
    expect(parseExpiry(' 1 / 2030 ')).toEqual({ month: 1, year: 2030 });
    expect(parseExpiry('13/26')).toBeUndefined();
    expect(isExpired(10, 2026, now)).toBe(false);
    expect(isExpired(9, 2026, now)).toBe(true);
  });

  it('validates a card and keeps only what may be stored', () => {
    const r = validateCard({ number: '4242 4242 4242 4242', expiry: '12/30', cvc: '123' }, now);
    expect(r.ok && { brand: r.value.brand, last4: r.value.last4 }).toEqual({
      brand: 'visa',
      last4: '4242',
    });
  });

  it('reports every field problem at once', () => {
    const r = validateCard({ number: '1234', expiry: '09/26', cvc: 'ab' }, now);
    expect(r.ok ? [] : r.error.map((i) => i.field)).toEqual(['number', 'expiry', 'cvc']);
    const amex = validateCard({ number: '378282246310005', expiry: '12/30', cvc: '123' }, now);
    expect(amex.ok ? [] : amex.error.map((i) => i.message)).toEqual([
      'Enter the 4-digit security code.',
    ]);
  });

  it('maps test cards to provider outcomes', () => {
    expect(TEST_CARDS.map((c) => testCardOutcome(c)._tag)).toEqual([
      'Succeeded',
      'Declined',
      'Declined',
      'ProcessingError',
    ]);
    expect(chargeOutcomeMessage(testCardOutcome('4000000000009995'))).toContain(
      'insufficient funds',
    );
  });
});
