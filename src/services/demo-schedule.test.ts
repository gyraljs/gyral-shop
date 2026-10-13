import { afterEach, describe, expect, it, vi } from 'vitest';
import { startDemoResetSchedule } from './demo-schedule.js';

const NY = 'America/New_York';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const THREE_AM = 3 * 60;

/** Runs the schedule on a fake clock starting at `start`; `reset` records each run's time. */
function scheduled(start: string, options: { readonly fail?: boolean; readonly at?: number } = {}) {
  vi.useFakeTimers({ now: new Date(start) });
  const runs: string[] = [];
  const log = vi.fn();
  const stop = startDemoResetSchedule({
    at: options.at ?? THREE_AM,
    timeZone: NY,
    reset: () => {
      runs.push(new Date().toISOString());
      return options.fail === true ? Promise.reject(new Error('disk full')) : Promise.resolve();
    },
    log,
  });
  return { runs, log, stop };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('nightly demo reset schedule', () => {
  it('resets once at the local reset time, then again the next night', async () => {
    // 02:58 EDT (UTC-4).
    const { runs, log, stop } = scheduled('2026-10-13T06:58:00Z');
    expect(log).toHaveBeenCalledWith(`demo reset: daily at 03:00 ${NY}`);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(runs).toEqual([]);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(runs).toEqual(['2026-10-13T07:00:00.000Z']);
    await vi.advanceTimersByTimeAsync(23 * HOUR);
    expect(runs).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(runs).toEqual(['2026-10-13T07:00:00.000Z', '2026-10-14T07:00:00.000Z']);
    expect(log).toHaveBeenLastCalledWith(
      expect.stringMatching(/^demo reset: database restored to the seed state \(03:00 America/),
    );
    stop();
    await vi.advanceTimersByTimeAsync(48 * HOUR);
    expect(runs).toHaveLength(2);
  });

  it('never resets because the server started after the reset time', async () => {
    // 10:00 EDT: today's reset is past, so the first one is tomorrow at 03:00.
    const { runs, stop } = scheduled('2026-10-13T14:00:00Z');
    await vi.advanceTimersByTimeAsync(16 * HOUR + 59 * MINUTE);
    expect(runs).toEqual([]);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(runs).toEqual(['2026-10-14T07:00:00.000Z']);
    stop();
  });

  it('follows the store time zone across a daylight-saving change', async () => {
    // US clocks fall back on 2026-11-01: 03:00 is 07:00Z before and 08:00Z after.
    const { runs, stop } = scheduled('2026-10-31T12:00:00Z');
    await vi.advanceTimersByTimeAsync(2 * 24 * HOUR);
    expect(runs).toEqual(['2026-11-01T08:00:00.000Z', '2026-11-02T08:00:00.000Z']);
    stop();
  });

  it('runs late rather than never when the clock jumps over the reset time', async () => {
    // US clocks spring forward on 2026-03-08 at 02:00, straight to 03:00: a 02:30 reset has no
    // minute that day, so it runs on the first tick after (03:00 EDT, 07:00Z).
    const { runs, stop } = scheduled('2026-03-08T06:00:00Z', { at: 2 * 60 + 30 });
    await vi.advanceTimersByTimeAsync(2 * HOUR);
    expect(runs).toEqual(['2026-03-08T07:00:00.000Z']);
    stop();
  });

  it('logs a failed reset and tries again the next night, not every minute', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { runs, stop } = scheduled('2026-10-13T06:59:00Z', { fail: true });
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(runs).toHaveLength(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/^demo reset failed .*next try is tomorrow/),
      expect.any(Error),
    );
    await vi.advanceTimersByTimeAsync(23 * HOUR); // 02:59 the next night
    expect(runs).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(runs).toHaveLength(2);
    stop();
  });

  it('never starts a second reset while one is still running', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-13T06:59:00Z') });
    let finish: () => void = () => undefined;
    const reset = vi.fn(
      () =>
        new Promise<void>((done) => {
          finish = done;
        }),
    );
    const stop = startDemoResetSchedule({ at: THREE_AM, timeZone: NY, reset, log: vi.fn() });
    // Still running a day later (a stuck reset): the next night's tick does not pile on.
    await vi.advanceTimersByTimeAsync(25 * HOUR);
    expect(reset).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(24 * HOUR);
    expect(reset).toHaveBeenCalledTimes(2);
    stop();
  });
});
