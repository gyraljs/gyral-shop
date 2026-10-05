// Static content pages (docs/product-specs/content.md): semantic, server-rendered light DOM
// with theme hooks (ADR 0006). Not legal advice: this is a demo store.
import { html, nothing, type IntentRejected } from '@gyral/core';
import { SITE_NAME } from '../layout/site.js';
import '../content/contact.js'; // registers <shop-contact-form> for server rendering

const UPDATED = '2026-10-04';

const prose = (title: string, body: unknown, lead?: string) => html`
  <article class="prose" data-region="content" aria-labelledby="title">
    <header>
      <h1 id="title">${title}</h1>
      ${lead === undefined ? nothing : html`<p class="lead">${lead}</p>`}
    </header>
    ${body}
  </article>
`;

export const aboutPage = () =>
  prose(
    `About ${SITE_NAME}`,
    html`<p>
        ${SITE_NAME} is a demonstration department store. Everything from electronics to groceries
        is generated sample data; nothing is for sale and no order is ever shipped.
      </p>
      <section data-region="why" aria-labelledby="why">
        <h2 id="why">Why it exists</h2>
        <p>
          It shows a complete, realistic web application built with
          <a href="https://github.com/gyraljs/gyral">Gyral</a>, a Model-View-Intent framework on web
          standards: server rendering, forms that work without JavaScript, and an accessible,
          themeable interface.
        </p>
      </section>
      <section data-region="how" aria-labelledby="how">
        <h2 id="how">How it's built</h2>
        <ul>
          <li>Semantic HTML first; every page works with JavaScript turned off.</li>
          <li>Modern CSS with design tokens, so the whole look can be re-themed.</li>
          <li>TypeScript on a Hono server with a SQLite database.</li>
        </ul>
      </section>`,
    'A store that is really a showcase.',
  );

const FAQ: readonly { readonly q: string; readonly a: string }[] = [
  {
    q: 'Can I really buy things here?',
    a: 'No. This is a demo store. Payments use a mock provider and nothing ships.',
  },
  {
    q: 'Which card numbers work at checkout?',
    a: 'Use 4242 4242 4242 4242 with any future expiry and any CVC. Other test cards simulate declines and errors.',
  },
  {
    q: 'How much is shipping?',
    a: 'Standard shipping is free on orders over $35 after discounts, otherwise $5.99. Express and next-day options are available.',
  },
  {
    q: 'Do you charge sales tax?',
    a: 'Tax is calculated from the shipping state, with illustrative state rates. Some states exempt groceries or clothing.',
  },
  {
    q: 'How do I reset my password?',
    a: 'Choose "Forgot your password?" on the sign-in page. In this demo, the email lands in the development mailbox at /dev/mail.',
  },
  {
    q: 'Can I return an order?',
    a: 'You can cancel an order from your account until it ships. Since nothing ships here, every order stays cancellable.',
  },
];

export const faqPage = () =>
  prose(
    'Frequently asked questions',
    html`<div class="faq" data-component="faq">
        ${FAQ.map(
          ({ q, a }) =>
            html`<details name="faq">
              <summary>${q}</summary>
              <p>${a}</p>
            </details>`,
        )}
      </div>
      <p>Still stuck? <a href="/contact">Contact us</a>.</p>`,
  );

export const termsPage = () =>
  prose(
    'Terms of use',
    html`<p>
        <small>Last updated <time datetime=${UPDATED}>4 October 2026</time></small>
      </p>
      <section data-region="t-demo" aria-labelledby="t-demo">
        <h2 id="t-demo">A demonstration only</h2>
        <p>
          ${SITE_NAME} is a demonstration. Products, prices and reviews are generated. No contract
          of sale is formed and no goods or payments change hands.
        </p>
      </section>
      <section data-region="t-accounts" aria-labelledby="t-accounts">
        <h2 id="t-accounts">Accounts</h2>
        <p>
          Don't use a real password you use elsewhere. Accounts and data may be reset at any time
          without notice.
        </p>
      </section>
      <section data-region="t-use" aria-labelledby="t-use">
        <h2 id="t-use">Acceptable use</h2>
        <p>Please don't try to break the site for anyone else, or submit others' personal data.</p>
      </section>`,
  );

export const privacyPage = () =>
  prose(
    'Privacy',
    html`<p>
        <small>Last updated <time datetime=${UPDATED}>4 October 2026</time></small>
      </p>
      <section data-region="p-collect" aria-labelledby="p-collect">
        <h2 id="p-collect">What we keep</h2>
        <dl>
          <dt>Account details</dt>
          <dd>Your name, email and a salted password hash. Never the password itself.</dd>
          <dt>Addresses and orders</dt>
          <dd>What you enter at checkout. Cards: only the brand, last four digits and expiry.</dd>
          <dt>Cookies</dt>
          <dd>
            A session cookie to keep you signed in and protect forms, and a short-lived cookie for
            one-time messages. Analytics only with your consent.
          </dd>
        </dl>
      </section>
      <section data-region="p-share" aria-labelledby="p-share">
        <h2 id="p-share">Sharing</h2>
        <p>Nothing is shared or sold. Emails are never sent: they stay in a local mailbox.</p>
      </section>`,
  );

export const contactPage = (csrfToken: string, rejected?: IntentRejected) =>
  prose(
    'Contact us',
    html`<shop-contact-form
      csrf-token=${csrfToken}
      .initialMessages=${rejected === undefined ? [] : [rejected]}
    ></shop-contact-form>`,
    'Questions about an order, a product or your account? Send us a message.',
  );

export const contactSentPage = () =>
  prose(
    'Thanks for your message',
    html`<p>We've received it and will reply by email. In this demo it lands in the outbox.</p>
      <p><a href="/">Back to the store</a></p>`,
  );
