// Script-safe JSON (docs/design-docs/0002-security.md): safe to place inside
// <script type="application/json"> or <script type="application/ld+json">.

// <, > and & could end the script element or start markup; U+2028/U+2029 end JS strings in
// older engines. Built from char codes so no raw separator ever sits in this source file.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);
const UNSAFE = new RegExp(`[<>&${LINE_SEPARATOR}${PARAGRAPH_SEPARATOR}]`, 'g');

const escape = (c: string): string => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`;

/** JSON.stringify, with characters that could end a script element or a JS string escaped. */
export function scriptSafeJson(value: unknown): string {
  const json = JSON.stringify(value) as string | undefined;
  if (json === undefined) throw new TypeError('scriptSafeJson: value is not serializable');
  return json.replace(UNSAFE, escape);
}
