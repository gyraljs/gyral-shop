import { describe, expect, it } from 'vitest';
import {
  dollarsText,
  optionsLabel,
  optionsText,
  parseDollars,
  parseImages,
  parseOptions,
  salesWindows,
} from './admin.js';

describe('admin parsing', () => {
  it('parses dollar amounts into cents', () => {
    expect(parseDollars('12')).toBe(1200);
    expect(parseDollars('12.5')).toBe(1250);
    expect(parseDollars(' $1,299.00 ')).toBe(129_900);
    expect(parseDollars('0.07')).toBe(7);
    for (const bad of ['', '-1', '1.234', 'abc', '1,2', '12.'])
      expect(parseDollars(bad), bad).toBeUndefined();
  });

  it('round-trips cents through the editable text', () => {
    for (const cents of [0, 7, 1250, 129_900]) expect(parseDollars(dollarsText(cents))).toBe(cents);
  });

  it('parses variant options and rejects malformed or duplicate names', () => {
    expect(parseOptions('Size=M; Color=Navy')).toEqual({ Size: 'M', Color: 'Navy' });
    expect(parseOptions('')).toEqual({});
    for (const bad of ['Size', 'Size=', '=M', 'Size=M=L', 'Size=M; Size=L']) {
      expect(parseOptions(bad), bad).toBeUndefined();
    }
    const options = { Size: 'M', Color: 'Navy' };
    expect(parseOptions(optionsText(options))).toEqual(options);
    expect(optionsLabel(options)).toBe('Size: M · Color: Navy');
  });

  it('parses one image per line with optional alt text', () => {
    expect(parseImages('/img/a.svg | Front\nhttps://x.test/b.jpg', 'Kettle')).toEqual([
      { url: '/img/a.svg', alt: 'Front' },
      { url: 'https://x.test/b.jpg', alt: 'Kettle' },
    ]);
    expect(parseImages('javascript:alert(1)', 'x')).toBeUndefined();
    expect(parseImages('', 'x')).toEqual([]);
  });

  it('starts sales windows at UTC midnight', () => {
    const w = salesWindows(new Date('2026-10-04T12:34:56Z'));
    expect(w.today.toISOString()).toBe('2026-10-04T00:00:00.000Z');
    expect(w.week.toISOString()).toBe('2026-09-28T00:00:00.000Z');
    expect(w.month.toISOString()).toBe('2026-09-05T00:00:00.000Z');
  });
});
