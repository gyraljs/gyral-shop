// Styles for the sign-in, registration and account pages (light DOM inside <main>).
export const accountCss = `
@layer components {
  .auth, .account { max-inline-size: 32rem; display: grid; gap: var(--space-3); }
  .auth h1, .account h1 { margin-block: 0; }
  .auth > p { margin-block: 0; }
  .account-details {
    display: grid; grid-template-columns: max-content 1fr; gap: var(--space-1) var(--space-3);
    margin: 0;
  }
  .account-details dt { font-weight: 600; }
  .account-details dd { margin: 0; overflow-wrap: anywhere; }
}
`;
