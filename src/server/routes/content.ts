// Content pages and the contact form (docs/product-specs/content.md, seo.md). Static pages are
// indexable with canonical URLs; the contact form posts through formAction to the outbox.
import { Hono, type Context } from 'hono';
import { formAction, seeOther } from '@gyral/ssr';
import type { IntentRejected } from '@gyral/core';
import { contactFormMail, type Mailer } from '../../services/mail.js';
import { ContactForm, topicLabel } from '../../ui/content/contact.js';
import {
  aboutPage,
  contactPage,
  contactSentPage,
  faqPage,
  privacyPage,
  termsPage,
} from '../../ui/pages/content.js';
import type { RenderPage } from '../document.js';
import { limitedResponse, overLimit } from '../limited-form.js';
import { csrfTokenFor, ip, LIMITS, SlidingWindowLimiter, type AppEnv } from '../security/index.js';

export interface ContentRouteOptions {
  readonly render: RenderPage;
  readonly mailer: Mailer;
  readonly now?: () => number;
}

type C = Context<AppEnv>;

/** Indexable content pages (also listed in the sitemap). */
export const STATIC_PAGES = [
  ['/about', 'About us', 'Who we are and why this store exists.', aboutPage],
  ['/faq', 'Frequently asked questions', 'Shipping, tax, payments, accounts and orders.', faqPage],
  ['/terms', 'Terms of use', 'The terms for using this demonstration store.', termsPage],
  [
    '/privacy',
    'Privacy',
    'What this store keeps about you, and what it never shares.',
    privacyPage,
  ],
] as const;

/** Every indexable content path, for the sitemap. */
export const CONTENT_PATHS: readonly string[] = [...STATIC_PAGES.map(([path]) => path), '/contact'];

export function contentRoutes({
  render,
  mailer,
  now = Date.now,
}: ContentRouteOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const contactLimiter = new SlidingWindowLimiter({ ...LIMITS.contactPerIp, now });

  for (const [path, title, description, view] of STATIC_PAGES) {
    app.get(path, (c) =>
      render({ title, description, canonical: new URL(path, c.req.url).href, main: view() }),
    );
  }

  const contactView = async (c: C, rejected?: IntentRejected, status = 200) => {
    const response = await render({
      title: 'Contact us',
      description: 'Send the store a message about an order, a product or your account.',
      canonical: new URL('/contact', c.req.url).href,
      status,
      main: contactPage(await csrfTokenFor(c), rejected),
    });
    response.headers.set('cache-control', 'no-store');
    return response;
  };

  app.get('/contact', (c) => contactView(c));

  app.post('/contact', async (c) => {
    const wait = overLimit(contactLimiter, [`ip:${ip(c)}`]);
    if (wait !== undefined) return limitedResponse(c, 'Submit', wait, (r) => contactView(c, r));
    return formAction(ContactForm, {
      intent: 'Submit',
      valid: async (data) => {
        await mailer.send(
          contactFormMail({
            fromName: data.name,
            fromEmail: data.email,
            topic: topicLabel(data.topic),
            message: data.message,
          }),
        );
        return seeOther('/contact/sent');
      },
      invalid: (r) => contactView(c, r, 422),
    })(c.req.raw);
  });

  app.get('/contact/sent', () =>
    render({ title: 'Message sent', noindex: true, main: contactSentPage() }),
  );

  return app;
}
