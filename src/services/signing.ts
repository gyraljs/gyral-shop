// HMAC signatures for values handed to the browser (place-order keys, order access cookies),
// keyed by the app secret (config APP_SECRET). Verification is constant-time.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const sign = (secret: string, value: string): string =>
  createHmac('sha256', secret).update(value).digest('base64url');

export function verify(secret: string, value: string, signature: string): boolean {
  const expected = Buffer.from(sign(secret, value));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
