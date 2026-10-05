import { directive, ElementDirective } from '@gyral/core';

/**
 * Focuses the element whenever `token` changes after the first render (never on the first
 * render, so hydration and initial page loads don't steal focus). Pair it with a counter in
 * model state that a reducer bumps when focus should move, e.g. after a page change.
 */
class FocusOn extends ElementDirective<[token: number]> {
  #last: number | undefined;

  apply(element: Element, [token]: [number]): void {
    const changed = this.#last !== undefined && this.#last !== token;
    this.#last = token;
    if (changed && element instanceof HTMLElement) element.focus();
  }
}

export const focusOn = directive(FocusOn);
