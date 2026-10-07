// Swaps the page's theme stylesheet in place (ADR 0006 rule 8): a driver, so the switcher's
// update stays pure and tests can fake it. The new <link> loads before the old one goes, so
// the page never shows unstyled content; with View Transitions (and no reduced-motion
// preference) the change cross-fades, otherwise it is instant.
import { command, defineDriver, type Command } from '@gyral/core';

/** The <link> the document shell renders for the theme (src/server/document.ts). */
export const THEME_LINK_ID = 'theme-css';

export interface ThemeSwap {
  readonly name: string;
  readonly href: string;
}

/** View Transitions are progressive enhancement (Gyral ADR 0003): skipped when unsupported. */
const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function loadNext(current: HTMLLinkElement, swap: ThemeSwap): Promise<void> {
  return new Promise((resolve) => {
    const next = current.cloneNode() as HTMLLinkElement;
    next.href = swap.href;
    next.dataset['theme'] = swap.name;
    const done = (keep: HTMLLinkElement, drop: HTMLLinkElement) => () => {
      drop.remove();
      keep.id = THEME_LINK_ID;
      resolve();
    };
    next.removeAttribute('id');
    next.addEventListener('load', done(next, current), { once: true });
    // A failed stylesheet keeps the old theme rather than leaving the page unstyled.
    next.addEventListener('error', done(current, next), { once: true });
    current.after(next);
  });
}

/** Swaps the theme link; resolves once the new stylesheet applies. */
export async function swapThemeLink(swap: ThemeSwap, doc: Document = document): Promise<undefined> {
  const current = doc.getElementById(THEME_LINK_ID);
  if (!(current instanceof HTMLLinkElement) || current.getAttribute('href') === swap.href) {
    return undefined;
  }
  const run = () => loadNext(current, swap);
  if ('startViewTransition' in doc && !prefersReducedMotion()) {
    const transition = doc.startViewTransition(run);
    // A newer transition skips this one and rejects its `ready` promise ("Transition was
    // skipped"); the swap itself still runs, so that rejection is expected, not an error.
    transition.ready.catch(() => undefined);
    await transition.finished;
  } else {
    await run();
  }
  return undefined;
}

export const themeLinkDriver = defineDriver<ThemeSwap, undefined>({
  name: 'theme-link',
  // In order: picking two themes quickly ends on the second.
  concurrency: 'queue',
  run: (swap) => swapThemeLink(swap),
});

export const swapTheme = <M>(swap: ThemeSwap, applied: M): Command<M> =>
  command(themeLinkDriver, swap, { onSuccess: () => applied, key: 'theme-link' });
