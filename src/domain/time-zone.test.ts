import { describe, expect, it } from 'vitest';
import { salesWindows } from './admin.js';
import { addDays, dayOfIn, dayStartIn, isTimeZone } from './time-zone.js';

const NY = 'America/New_York';
const iso = (d: Date) => d.toISOString();

describe('store time zone days', () => {
  it('knows real zones only', () => {
    expect(isTimeZone(NY)).toBe(true);
    expect(isTimeZone('UTC')).toBe(true);
    expect(isTimeZone('Mars/Olympus_Mons')).toBe(false);
  });

  it('finds local midnight on both sides of the spring-forward change (New York, Mar 8 2026)', () => {
    expect(iso(dayStartIn('2026-03-07', NY))).toBe('2026-03-07T05:00:00.000Z'); // EST
    expect(iso(dayStartIn('2026-03-08', NY))).toBe('2026-03-08T05:00:00.000Z'); // still EST at 00:00
    expect(iso(dayStartIn('2026-03-09', NY))).toBe('2026-03-09T04:00:00.000Z'); // EDT
  });

  it('finds local midnight on both sides of the fall-back change (New York, Nov 1 2026)', () => {
    expect(iso(dayStartIn('2026-11-01', NY))).toBe('2026-11-01T04:00:00.000Z'); // EDT at 00:00
    expect(iso(dayStartIn('2026-11-02', NY))).toBe('2026-11-02T05:00:00.000Z'); // EST
  });

  it('handles half-hour zones and the southern hemisphere', () => {
    expect(iso(dayStartIn('2026-10-05', 'Asia/Kolkata'))).toBe('2026-10-04T18:30:00.000Z');
    // Sydney leaves daylight time on Apr 5 2026 (AEDT +11 → AEST +10).
    expect(iso(dayStartIn('2026-04-05', 'Australia/Sydney'))).toBe('2026-04-04T13:00:00.000Z');
    expect(iso(dayStartIn('2026-04-06', 'Australia/Sydney'))).toBe('2026-04-05T14:00:00.000Z');
  });

  it('names the local day of an instant, including late evening and the repeated hour', () => {
    expect(dayOfIn(new Date('2026-03-09T03:30:00Z'), NY)).toBe('2026-03-08'); // 23:30 EDT
    expect(dayOfIn(new Date('2026-11-01T05:30:00Z'), NY)).toBe('2026-11-01'); // 01:30 EST (second time)
    expect(dayOfIn(new Date('2026-11-02T04:59:59Z'), NY)).toBe('2026-11-01'); // 23:59:59 EST
  });

  it('round-trips every day of a year: a day contains its own start', () => {
    let day = '2026-01-01';
    for (let n = 0; n < 365; n += 1) {
      const start = dayStartIn(day, NY);
      expect(dayOfIn(start, NY), day).toBe(day);
      expect(dayOfIn(new Date(start.getTime() - 1), NY), day).toBe(addDays(day, -1));
      day = addDays(day, 1);
    }
  });
});

describe('dashboard sales windows in the store time zone', () => {
  it('starts today, 7 days and 30 days at local midnights across a DST change', () => {
    const w = salesWindows(new Date('2026-03-10T12:00:00Z'), NY);
    expect(iso(w.today)).toBe('2026-03-10T04:00:00.000Z');
    expect(iso(w.week)).toBe('2026-03-04T05:00:00.000Z'); // before the change: 23-hour day inside
    expect(iso(w.month)).toBe('2026-02-09T05:00:00.000Z');
  });

  it('uses the local day, not the UTC day, late in the evening', () => {
    // 22:30 EST on Mar 7 is already Mar 8 in UTC.
    const w = salesWindows(new Date('2026-03-08T03:30:00Z'), NY);
    expect(iso(w.today)).toBe('2026-03-07T05:00:00.000Z');
  });

  it('defaults to UTC days', () => {
    expect(iso(salesWindows(new Date('2026-03-08T03:30:00Z')).today)).toBe(
      '2026-03-08T00:00:00.000Z',
    );
  });
});
