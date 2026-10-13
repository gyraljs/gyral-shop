// The nightly demo reset's clock (config DEMO_RESET_AT, docs/design-docs/0007-deployment.md).
// It runs in the server process next to the hourly purge (./maintenance.ts), not in host cron:
// the reset must take the process's write lock (src/db/tx.ts) and refresh its caches.
//
// Every tick compares the store's wall clock (STORE_TIME_ZONE) with the reset time. The reset
// runs once per local day, on the first tick at or after that time, so a missed minute (a busy
// event loop, a suspended host) or a daylight-saving jump over the time delays it instead of
// skipping it. Starting after the day's reset time waits for the next day: a restart never
// resets the store by itself.
import { wallClockIn } from '../domain/time-zone.js';

/** Once a minute: the reset is at most a minute late, and a tick costs one Intl format. */
export const DEMO_TICK_MS = 60_000;

export interface DemoScheduleOptions {
  /** Minutes after local midnight (config DEMO_RESET_AT). */
  readonly at: number;
  /** The store's IANA time zone (config STORE_TIME_ZONE). */
  readonly timeZone: string;
  /** Puts the store back to the seed state. Throwing logs the error; tomorrow is the retry. */
  readonly reset: () => Promise<void>;
  readonly now?: () => Date;
  readonly tickMs?: number;
  readonly log?: (message: string) => void;
}

const hhmm = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Starts the schedule; returns a stop function. The timer never keeps the process alive. */
export function startDemoResetSchedule(options: DemoScheduleOptions): () => void {
  const now = options.now ?? (() => new Date());
  const log =
    options.log ??
    ((m: string) => {
      console.log(m);
    });
  const at = hhmm(options.at);
  const start = wallClockIn(now(), options.timeZone);
  // The last local day whose reset is done (or was due before this process started).
  let done: string | undefined = start.minutes >= options.at ? start.day : undefined;
  let running = false;

  const tick = async () => {
    if (running) return;
    const clock = wallClockIn(now(), options.timeZone);
    if (clock.minutes < options.at || clock.day === done) return;
    done = clock.day; // one attempt per day, whatever the outcome
    running = true;
    const started = Date.now();
    try {
      await options.reset();
      log(
        `demo reset: database restored to the seed state ` +
          `(${at} ${options.timeZone}, ${String(Date.now() - started)} ms)`,
      );
    } catch (error) {
      console.error(
        `demo reset failed (${at} ${options.timeZone}); the next try is tomorrow`,
        error,
      );
    } finally {
      running = false;
    }
  };

  log(`demo reset: daily at ${at} ${options.timeZone}`);
  const timer = setInterval(() => void tick(), options.tickMs ?? DEMO_TICK_MS);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
