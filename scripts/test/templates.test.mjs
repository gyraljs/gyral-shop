import { describe, expect, it } from 'vitest';
import { emptyTextBindings } from '../lib/templates.mjs';

const check = (src) => emptyTextBindings('x.ts', src);

describe('emptyTextBindings', () => {
  it('flags empty fallbacks in text position', () => {
    expect(check("html`<p>${msg ?? ''}</p>`")).toHaveLength(1);
    expect(check("html`<p class=${k}>${a.b || ''}</p>`")).toHaveLength(1);
    expect(check("html`not applied: ${m ?? ''}`")).toHaveLength(1);
    expect(check('html`<p a="${x}" b>\n  ${\n    err ?? \'\'\n  }</p>`')[0]).toContain('nothing');
  });

  it('ignores attributes, properties and plain code', () => {
    expect(check("html`<input .value=${q ?? ''} />`")).toEqual([]);
    expect(check('html`<p class="added ${k ?? \'\'}">x</p>`')).toEqual([]);
    expect(check("html`<input value=${v ?? ''} name=${n}>`")).toEqual([]);
    expect(check("const accept = headers.get('accept') ?? '';")).toEqual([]);
    expect(check("const q = `${a ?? ''}&b`;")).toEqual([]);
  });
});
