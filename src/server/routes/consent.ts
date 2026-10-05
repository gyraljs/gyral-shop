// Cookie consent (docs/product-specs/consent.md): GET /consent is the settings page (linked
// from every footer, so the choice can be changed any time); POST /consent saves a choice.
// POST is origin-verified instead of token-verified (ADR 0002 addendum): the banner is shown
// to every first-time visitor, and a token would start a session for each of them.
import { Hono, type Context } from 'hono';
import { formAction, seeOther } from '@gyral/ssr';
import { html, type IntentRejected } from '@gyral/core';
import { consentFor } from '../../domain/consent.js';
import { ConsentForm } from '../../ui/consent/consent.js';
import { readConsent, setConsent } from '../consent.js';
import type { RenderPage } from '../document.js';
import { safeNext, type AppEnv } from '../security/index.js';

export interface ConsentRouteOptions {
  readonly render: RenderPage;
}

export function consentRoutes({ render }: ConsentRouteOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  const settings = async (c: Context<AppEnv>, status = 200, rejected?: IntentRejected) => {
    const analytics = readConsent(c)?.analytics;
    const response = await render({
      title: 'Cookie settings',
      noindex: true,
      status,
      main: html`<h1 class="visually-hidden">Cookie settings</h1>
        <shop-consent
          mode="page"
          return-to="/consent"
          ?analytics=${analytics === true}
          .initialMessages=${rejected === undefined ? [] : [rejected]}
        ></shop-consent>`,
    });
    response.headers.set('cache-control', 'no-store');
    return response;
  };

  app.get('/consent', (c) => settings(c));

  app.post('/consent', async (c) =>
    formAction(ConsentForm, {
      intent: 'Choose',
      valid: (data) => {
        setConsent(c, consentFor(data.choice, data.analytics === 'on'));
        return seeOther(safeNext(data.return));
      },
      invalid: (rejected) => settings(c, 422, rejected),
    })(c.req.raw),
  );

  return app;
}
