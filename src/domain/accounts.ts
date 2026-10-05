// Account rules shared by the browser and the server (docs/design-docs/0002-security.md).

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_NAME_LENGTH = 80;

// A short list of the most common passwords that pass the length rule. Not exhaustive: it
// catches the obvious ones without shipping a large dictionary to the browser.
const COMMON_PASSWORDS = new Set([
  '1234567890',
  '0123456789',
  '1111111111',
  'qwertyuiop',
  'password12',
  'password123',
  'password1234',
  'iloveyou12',
  'qwerty1234',
  'abcdefghij',
  'abc1234567',
  'letmein123',
  'welcome123',
  'monkey1234',
  'football12',
  'baseball12',
  'sunshine12',
  'princess12',
  'dragon1234',
  'passw0rd12',
]);

/** Why a new password is unacceptable, or undefined when it is fine. */
export function passwordProblem(password: string): string | undefined {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${String(MIN_PASSWORD_LENGTH)} characters.`;
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'That password is too common. Choose another.';
  }
  return undefined;
}

/** The name to greet a member by: the first word of their name. */
export function firstName(name: string): string {
  const [first] = name.trim().split(/\s+/);
  return first === undefined || first === '' ? name : first;
}
