import { describe, expect, it } from 'vitest';
import { createMailer, passwordResetMail } from '../../src/services/mail.js';
import { createApp } from '../../src/server/app.js';
import { CLIENT_ENTRY, testApp } from '../support/app.js';

describe('/dev/mail', () => {
  it('lists outbox messages and shows one with clickable links', async () => {
    const { db, get } = await testApp({ seed: false });
    expect(await (await get('/dev/mail')).text()).toContain('The outbox is empty');
    const id = await createMailer(db).send(
      passwordResetMail({
        to: 'ada@example.com',
        name: 'Ada',
        resetUrl: 'http://localhost:5200/account/reset?token=t1',
        expiresInMinutes: 30,
      }),
    );

    const list = await get('/dev/mail');
    const listHtml = await list.text();
    expect(list.status).toBe(200);
    expect(listHtml).toContain('<meta name="robots" content="noindex"');
    expect(listHtml).toMatch(new RegExp(`href="/dev/mail/(<!--[^>]*-->)*${String(id)}"`));
    expect(listHtml).toContain('Reset your Gyral Goods password');

    const view = await get(`/dev/mail/${String(id)}`);
    const viewHtml = await view.text();
    expect(view.status).toBe(200);
    expect(viewHtml).toContain('sandbox="allow-top-navigation-by-user-activation allow-popups"');
    expect(viewHtml).toContain('<base target=&quot;_top&quot;>'); // srcdoc is escaped
    expect(viewHtml).toMatch(/<a href="http:\/\/localhost:5200\/account\/reset\?token=t1"/);
  });

  it('answers 404 for a missing message', async () => {
    const { get } = await testApp({ seed: false });
    expect((await get('/dev/mail/42')).status).toBe(404);
    expect((await get('/dev/mail/abc')).status).toBe(404);
  });

  it('does not exist in production', async () => {
    const { db } = await testApp({ seed: false });
    const app = createApp({ clientEntry: CLIENT_ENTRY, db, mode: 'production' });
    expect((await app.request('/dev/mail')).status).toBe(404);
    expect((await app.request('/dev/mail/1')).status).toBe(404);
  });
});
