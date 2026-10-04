import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../db/client.js';
import { createMailer } from './outbox.js';

const message = (subject: string) => ({
  to: 'ada@example.com',
  subject,
  text: 't',
  html: '<p>h</p>',
});

describe('mail outbox', () => {
  it('stores messages and reads them back newest first', async () => {
    const mailer = createMailer(await createTestDb());
    const first = await mailer.send(message('first'));
    const second = await mailer.send(message('second'));
    expect(second).toBeGreaterThan(first);
    expect((await mailer.list()).map((m) => m.subject)).toEqual(['second', 'first']);
    const stored = await mailer.get(first);
    expect(stored?.subject).toBe('first');
    expect(stored?.createdAt).toBeInstanceOf(Date);
    expect(await mailer.get(999)).toBeUndefined();
  });
});
