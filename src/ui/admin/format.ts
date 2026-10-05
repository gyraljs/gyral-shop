// Small formatting helpers shared by the admin components.
import type { HttpError } from '@gyral/http';
import type { AdminOrderStatus } from '../../domain/admin.js';
import { STATUS_LABEL } from '../orders/parts.js';

export const statusLabel = (status: AdminOrderStatus): string => STATUS_LABEL[status];

/** A message for a failed admin API request (the details are logged, not shown). */
export function loadError(error: HttpError): string {
  if (error._tag === 'HttpStatusError') {
    if (error.status === 401) return 'Your session has ended. Sign in again to continue.';
    if (error.status === 403) return 'Your account is not allowed to use the admin.';
    if (error.status === 404) return 'That record no longer exists.';
  }
  if (error._tag === 'HttpNetworkError') return 'The server could not be reached. Try again.';
  return 'Something went wrong loading this page. Try again.';
}

/** A short date and time for tables: "Oct 4, 2026, 3:15 PM". */
export const dateTime = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

/** A date without a time, for promo windows: "Nov 27, 2026". */
export const dateOnly = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });
