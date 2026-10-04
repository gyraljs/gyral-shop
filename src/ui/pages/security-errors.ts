// Pages for requests the security middleware turns away (docs/design-docs/0002-security.md).
import { html } from '@gyral/core';

export type SecurityRejection = 'csrf' | 'forbidden' | 'rate-limited';

export const SECURITY_TITLES: Readonly<Record<SecurityRejection, string>> = {
  csrf: 'Please try that again',
  forbidden: 'Not allowed',
  'rate-limited': 'Too many attempts',
};

const retryText = (seconds: number) =>
  seconds < 60
    ? `${String(seconds)} seconds`
    : `${String(Math.ceil(seconds / 60))} minute${seconds > 60 ? 's' : ''}`;

export const securityErrorPage = (kind: SecurityRejection, retryAfterSeconds = 0) => {
  switch (kind) {
    case 'csrf':
      return html`
        <h1>${SECURITY_TITLES.csrf}</h1>
        <p>
          Your form expired or was opened in another session, so we didn't submit it. Go back,
          reload the page and submit it again.
        </p>
      `;
    case 'forbidden':
      return html`
        <h1>${SECURITY_TITLES.forbidden}</h1>
        <p>Your account can't open this page. <a href="/">Go to the home page</a>.</p>
      `;
    case 'rate-limited':
      return html`
        <h1>${SECURITY_TITLES['rate-limited']}</h1>
        <p>For your security, please wait ${retryText(retryAfterSeconds)} and try again.</p>
      `;
  }
};
