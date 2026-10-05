import { describe, expect, it } from 'vitest';
import { STATE_CODES } from './tax.js';
import { STATE_NAMES, STATE_OPTIONS } from './us-states.js';

describe('US states', () => {
  it('names every state code the tax table knows', () => {
    for (const code of STATE_CODES) expect(STATE_NAMES[code]).toMatch(/^[A-Z]/);
    expect(STATE_OPTIONS).toHaveLength(STATE_CODES.length);
  });

  it('sorts options by name', () => {
    const names = STATE_OPTIONS.map((s) => s.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});
