// Full page navigation as a command, e.g. after signing in: the server-rendered header must
// reload to show the member. Tests substitute it with `el.drivers = { location: fake }`.
import { command, defineDriver, type Command } from '@gyral/core';

export const locationDriver = defineDriver<string, undefined>({
  name: 'location',
  run: (url) => {
    window.location.assign(url);
    return undefined;
  },
});

export const goTo = (url: string): Command<never> =>
  command<string, undefined, unknown, never>(locationDriver, url, { onSuccess: () => undefined });
