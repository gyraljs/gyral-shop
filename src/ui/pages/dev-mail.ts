// The development mail viewer (docs/product-specs/mail.md). Server-rendered only.
import { html } from '@gyral/core';

export interface MailSummary {
  readonly id: number;
  readonly to: string;
  readonly subject: string;
  readonly createdAt: Date;
}

export interface MailDetail extends MailSummary {
  readonly text: string;
  readonly html: string;
}

const when = (date: Date) =>
  html`<time datetime=${date.toISOString()}
    >${date.toLocaleString('en-US', { timeZone: 'UTC' })} UTC</time
  >`;

export const devMailListPage = (messages: readonly MailSummary[]) => html`
  <h1>Mail outbox</h1>
  <p>
    Development only. Messages the store would have sent; nothing leaves this machine. Newest first.
  </p>
  ${
    messages.length === 0
      ? html`<p>The outbox is empty.</p>`
      : html`<table class="dev-mail">
          <caption>
            ${messages.length} ${messages.length === 1 ? 'message' : 'messages'}
          </caption>
          <thead>
            <tr>
              <th scope="col">Sent</th>
              <th scope="col">To</th>
              <th scope="col">Subject</th>
            </tr>
          </thead>
          <tbody>
            ${messages.map(
              (m) =>
                html`<tr>
                  <td>${when(m.createdAt)}</td>
                  <td>${m.to}</td>
                  <td><a href="/dev/mail/${m.id}">${m.subject}</a></td>
                </tr>`,
            )}
          </tbody>
        </table>`
  }
`;

const URL_PATTERN = /(https?:\/\/[^\s<>"]+)/g;

/** Plain text with http(s) URLs turned into links. Gyral's `html` escapes everything else. */
const linkified = (text: string) =>
  text
    .split(URL_PATTERN)
    .map((part, n) => (n % 2 === 1 ? html`<a href=${part}>${part}</a>` : part));

/**
 * The HTML body renders in a sandboxed iframe: its scripts never run, but a click on one of its
 * links may navigate this tab (`<base target="_top">` plus user activation).
 */
const framed = (body: string) => `<base target="_top">${body}`;

export const devMailMessagePage = (message: MailDetail) => html`
  <p><a href="/dev/mail">← All messages</a></p>
  <article class="dev-mail-message">
    <h1>${message.subject}</h1>
    <dl>
      <dt>To</dt>
      <dd>${message.to}</dd>
      <dt>Sent</dt>
      <dd>${when(message.createdAt)}</dd>
    </dl>
    <section aria-labelledby="mail-html">
      <h2 id="mail-html">HTML</h2>
      <iframe
        title="HTML body of “${message.subject}”"
        sandbox="allow-top-navigation-by-user-activation allow-popups"
        srcdoc=${framed(message.html)}
      ></iframe>
    </section>
    <section aria-labelledby="mail-text">
      <h2 id="mail-text">Plain text</h2>
      <pre>${linkified(message.text)}</pre>
    </section>
  </article>
`;
