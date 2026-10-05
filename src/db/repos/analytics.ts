// Mock analytics storage (consent.md). Only called after the visitor consented to analytics.
import type { Db } from '../client.js';
import { analyticsEvents } from '../schema.js';
import { lockedWrite } from '../tx.js';

export type AnalyticsKind = 'page_view' | 'add_to_cart';

export interface AnalyticsEvent {
  readonly kind: AnalyticsKind;
  readonly path: string;
  readonly sessionId?: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

export function recordEvent(db: Db, event: AnalyticsEvent): Promise<void> {
  return lockedWrite(db, async (w) => {
    await w.insert(analyticsEvents).values({
      kind: event.kind,
      path: event.path,
      sessionId: event.sessionId ?? null,
      data: event.data ?? null,
    });
  });
}
