// Calendar days in the store's time zone (config STORE_TIME_ZONE). Pure, using only Intl: a
// "day" starts at local midnight, so around daylight-saving changes a day is 23 or 25 hours.

/** True for an IANA zone the runtime knows, e.g. "America/New_York". */
export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsIn(
  instant: Date,
  zone: string,
): Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number> {
  let fmt = formatters.get(zone);
  if (fmt === undefined) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(zone, fmt);
  }
  const out = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const part of fmt.formatToParts(instant)) {
    if (part.type in out) out[part.type as keyof typeof out] = Number(part.value);
  }
  return out;
}

/** The zone's offset from UTC at `instant`, in milliseconds (local minus UTC). */
function offsetAt(instant: number, zone: string): number {
  const p = partsIn(new Date(instant), zone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** The calendar day (YYYY-MM-DD) an instant falls on in `zone`. */
export function dayOfIn(instant: Date, zone: string): string {
  const p = partsIn(instant, zone);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** The instant a calendar day (YYYY-MM-DD) starts in `zone`: its local midnight. */
export function dayStartIn(day: string, zone: string): Date {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  // The offset at the guess may differ from the offset at the true midnight (a DST change in
  // between); one correction step settles it.
  const first = guess - offsetAt(guess, zone);
  const second = guess - offsetAt(first, zone);
  return new Date(second);
}

/** Calendar arithmetic on YYYY-MM-DD: `addDays('2026-03-01', -1)` is '2026-02-28'. */
export function addDays(day: string, days: number): string {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
