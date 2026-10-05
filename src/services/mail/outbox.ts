// The mock mailer: messages land in the `outbox` table instead of being sent
// (docs/product-specs/mail.md). /dev/mail reads them back.
import { desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { outbox } from '../../db/schema.js';
import type { MailMessage } from './templates.js';
import { lockedWrite } from '../../db/tx.js';

export interface StoredMail extends MailMessage {
  readonly id: number;
  readonly createdAt: Date;
}

export interface Mailer {
  /** Stores the message and returns its outbox id. */
  readonly send: (message: MailMessage) => Promise<number>;
  /** Newest first. */
  readonly list: (limit?: number) => Promise<readonly StoredMail[]>;
  readonly get: (id: number) => Promise<StoredMail | undefined>;
}

export function createMailer(db: Db): Mailer {
  return {
    send: async (message) => {
      const [row] = await lockedWrite(db, (w) =>
        w
          .insert(outbox)
          .values({
            to: message.to,
            subject: message.subject,
            text: message.text,
            html: message.html,
          })
          .returning({ id: outbox.id }),
      );
      if (row === undefined) throw new Error('outbox insert returned no row');
      return row.id;
    },
    list: async (limit = 100) =>
      db.select().from(outbox).orderBy(desc(outbox.createdAt), desc(outbox.id)).limit(limit),
    get: async (id) => {
      const [row] = await db.select().from(outbox).where(eq(outbox.id, id));
      return row;
    },
  };
}
