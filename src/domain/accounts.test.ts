import { describe, expect, it } from 'vitest';
import { firstName, MIN_PASSWORD_LENGTH, passwordProblem } from './accounts.js';

describe('passwordProblem', () => {
  it('requires the minimum length', () => {
    expect(passwordProblem('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toContain('at least');
    expect(passwordProblem('correct horse')).toBeUndefined();
  });

  it('rejects common passwords regardless of case', () => {
    expect(passwordProblem('Password123')).toContain('too common');
  });
});

describe('firstName', () => {
  it('takes the first word', () => {
    expect(firstName('  Ada   Lovelace ')).toBe('Ada');
    expect(firstName('Cher')).toBe('Cher');
  });
});
