import { describe, expect, it } from 'vitest';
import { scriptSafeJson } from './json.js';
import { safeNext } from './request.js';

describe('scriptSafeJson', () => {
  it('escapes characters that could end a script element or a JS string', () => {
    const hostile = { s: '</script><script>alert(1)</script>&', ls: String.fromCharCode(0x2028) };
    const out = scriptSafeJson(hostile);
    expect(out).not.toMatch(/[<>&]/);
    expect(out).not.toContain(String.fromCharCode(0x2028));
    expect(JSON.parse(out)).toEqual(hostile);
  });

  it('rejects values JSON cannot represent', () => {
    expect(() => scriptSafeJson(undefined)).toThrow(TypeError);
  });
});

describe('safeNext', () => {
  it('keeps same-site paths and refuses everything else', () => {
    expect(safeNext('/account/orders?page=2')).toBe('/account/orders?page=2');
    for (const bad of [
      undefined,
      'https://evil.test',
      '//evil.test',
      '/\\evil.test',
      'x',
      '/a\nb',
    ]) {
      expect(safeNext(bad)).toBe('/');
    }
  });
});
