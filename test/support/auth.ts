// Login helper for route tests. A stub until sessions exist (bead "Sessions, CSRF, roles,
// rate limiting middleware" in the Accounts epic); it will return a cookie header.
export function loginAs(email: string): never {
  throw new Error(`loginAs(${email}): sessions are not implemented yet (Accounts epic).`);
}
