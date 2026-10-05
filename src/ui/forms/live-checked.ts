import { directive, ElementDirective } from '@gyral/core';

/**
 * Keeps a checkbox or radio's *current* checked state equal to model state in the browser
 * (e.g. after Back restores an older listing). Pair it with `?checked=${value}` for the server
 * render: element directives never run on the server, and a `.checked=${value}` property
 * binding must not be used on server-rendered inputs: Lit's SSR writes it as the attribute
 * `checked="false"`, which checks the box.
 *
 *   <input type="checkbox" ?checked=${on} ${liveChecked(on)} />
 */
class LiveChecked extends ElementDirective<[checked: boolean]> {
  apply(element: Element, [checked]: [boolean]): void {
    if (element instanceof HTMLInputElement && element.checked !== checked) {
      element.checked = checked;
    }
  }
}

export const liveChecked = directive(LiveChecked);
