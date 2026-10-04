import { describe, expect, it } from 'vitest';
import { add, format, percentOf, sum, times, usd } from './money.js';

describe('money', () => {
  it('adds and multiplies in integer cents', () => {
    expect(add(usd(199), usd(1)).cents).toBe(200);
    expect(times(usd(333), 3).cents).toBe(999);
    expect(sum([usd(1), usd(2), usd(3)]).cents).toBe(6);
  });

  it('rounds percentages half away from zero', () => {
    expect(percentOf(usd(999), 7.25).cents).toBe(72);
    expect(percentOf(usd(-999), 7.25).cents).toBe(-72);
    expect(percentOf(usd(200), 0.25).cents).toBe(1);
  });

  it('rejects fractional cents', () => {
    expect(() => usd(1.5)).toThrow(RangeError);
  });

  it('formats as US dollars', () => {
    expect(format(usd(123456))).toBe('$1,234.56');
  });
});
